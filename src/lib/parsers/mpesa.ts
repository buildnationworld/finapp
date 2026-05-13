import { AccountProvider, TransactionDirection, TransactionType } from "@prisma/client";

import type { ParsedTransaction, ParserResult, SmsParser } from "./types";
import { cleanName, normalizePhone, parseAmount, parseSmsDate } from "./util";

/**
 * Detects an M-Pesa confirmation SMS. M-Pesa messages share a few markers:
 *   - The confirmation ref is a 10-char uppercase alphanumeric at the start
 *   - The string "M-PESA" or "M-Pesa" appears somewhere (balance / Fuliza)
 *   - The currency is rendered as "Ksh" (occasionally "KSh" or "KES")
 *
 * Fuliza SMS don't carry a leading ref and rely on the "Fuliza M-PESA" string.
 */
const REF = /^([A-Z0-9]{10})\b/;
const HAS_MPESA = /\bM-?PESA\b/i;
const FULIZA = /Fuliza\s+M-?PESA/i;

function withDefaults(
  partial: Partial<ParsedTransaction> & {
    amount: number;
    direction: TransactionDirection;
    type: TransactionType;
    occurredAt: Date;
    rawText: string;
  },
): ParsedTransaction {
  return {
    externalRef: partial.externalRef ?? null,
    provider: AccountProvider.MPESA,
    direction: partial.direction,
    type: partial.type,
    amount: partial.amount,
    fee: partial.fee ?? 0,
    balanceAfter: partial.balanceAfter ?? null,
    counterpartyName: partial.counterpartyName ?? null,
    counterpartyPhone: partial.counterpartyPhone ?? null,
    merchant: partial.merchant ?? null,
    occurredAt: partial.occurredAt,
    rawText: partial.rawText,
    confidence: partial.confidence ?? 0.95,
    parser: "mpesa",
  };
}

function extractCommon(text: string) {
  const ref = REF.exec(text)?.[1] ?? null;
  const balanceM =
    /(?:New\s+M-?PESA\s+balance\s+is|M-Pesa\s+balance)\s+Ksh\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const balance = parseAmount(balanceM?.[1]);
  const feeM = /Transaction\s+cost,?\s+Ksh\s*([\d,]+(?:\.\d+)?)/i.exec(text);
  const fee = parseAmount(feeM?.[1]) ?? 0;
  return { ref, balance, fee };
}

/** "[REF] Confirmed. Ksh1,500.00 sent to JOHN DOE 0712345678 on 15/2/24 at 3:45 PM..." */
function trySentToPerson(text: string): ParsedTransaction | null {
  const re =
    /Confirmed\.\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+sent\s+to\s+([A-Z][A-Z\s.'-]+?)\s+(\+?\d{3,15})\s+(?:on\s+)?([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[4]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance, fee } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.OUT,
    type: TransactionType.TRANSFER,
    amount,
    fee,
    balanceAfter: balance,
    counterpartyName: cleanName(m[2]),
    counterpartyPhone: normalizePhone(m[3]),
    occurredAt,
    rawText: text,
  });
}

/** "...You have received Ksh2,000.00 from JANE SMITH 0723456789 on 16/2/24 at 10:30 AM..." */
function tryReceivedFromPerson(text: string): ParsedTransaction | null {
  const re =
    /received\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+from\s+(.+?)\s+on\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+(?:at\s+)?\d{1,2}:\d{2}(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[3]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance } = extractCommon(text);
  const sender = (m[2] ?? "").trim();
  if (!sender) return null;
  const phoneMatch = /(.+?)\s+(\+?\d{3,15})$/.exec(sender);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.IN,
    type: TransactionType.TRANSFER,
    amount,
    fee: 0,
    balanceAfter: balance,
    counterpartyName: cleanName(phoneMatch?.[1] ?? sender),
    counterpartyPhone: normalizePhone(phoneMatch?.[2] ?? null),
    occurredAt,
    rawText: text,
  });
}

/** "...Ksh1,200.00 sent to KPLC PREPAID for account 12345678 on 17/2/24 at 8:00 AM..." */
function tryPaybill(text: string): ParsedTransaction | null {
  const re =
    /Confirmed\.\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+sent\s+to\s+([A-Z0-9][A-Z0-9\s.'&-]+?)\s+for\s+account\s+([\w-]+)\s+(?:on\s+)?([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[4]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance, fee } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.OUT,
    type: TransactionType.PAYBILL,
    amount,
    fee,
    balanceAfter: balance,
    counterpartyName: cleanName(m[2]),
    merchant: `${cleanName(m[2])} (acc ${m[3]})`,
    occurredAt,
    rawText: text,
  });
}

/** "...Ksh450.00 paid to NAIVAS SUPERMARKET. on 18/2/24 at 12:00 PM..." */
function tryBuyGoods(text: string): ParsedTransaction | null {
  const re =
    /Confirmed\.\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+paid\s+to\s+([A-Z0-9][A-Z0-9\s.'&-]+?)\.?\s+(?:on\s+)?([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[3]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance, fee } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.OUT,
    type: TransactionType.TILL,
    amount,
    fee,
    balanceAfter: balance,
    counterpartyName: cleanName(m[2]),
    merchant: cleanName(m[2]),
    occurredAt,
    rawText: text,
  });
}

/** "...Confirmed.on 19/2/24 at 5:00 PM Withdraw Ksh500.00 from 123456 - SHIRAZ AGENT..." */
function tryWithdraw(text: string): ParsedTransaction | null {
  const re =
    /on\s+([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)\s+Withdraw\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+from\s+([\d]+)\s*-\s*([A-Z0-9][A-Z0-9\s.'&-]+?)\s+New/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[1]);
  const amount = parseAmount(m[2]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance, fee } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.OUT,
    type: TransactionType.WITHDRAWAL,
    amount,
    fee,
    balanceAfter: balance,
    counterpartyName: cleanName(m[4]),
    merchant: `${cleanName(m[4])} (agent ${m[3]})`,
    occurredAt,
    rawText: text,
  });
}

/** "...You bought Ksh50.00 of airtime on 19/2/24 at 5:00 PM..." */
function tryAirtime(text: string): ParsedTransaction | null {
  const re =
    /bought\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+of\s+airtime\s+(?:on\s+)?([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[2]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance, fee } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.OUT,
    type: TransactionType.AIRTIME,
    amount,
    fee,
    balanceAfter: balance,
    counterpartyName: "Safaricom Airtime",
    merchant: "Safaricom Airtime",
    occurredAt,
    rawText: text,
  });
}

/** "...You have deposited Ksh1,000.00 to your M-PESA account on..." */
function tryDeposit(text: string): ParsedTransaction | null {
  const re =
    /deposited\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+to\s+your\s+M-?PESA\s+account\s+(?:on\s+)?([\d\/\-]+\s+(?:at\s+)?[\d:]+(?:\s*[AP]M)?)/i;
  const m = re.exec(text);
  if (!m) return null;
  const occurredAt = parseSmsDate(m[2]);
  const amount = parseAmount(m[1]);
  if (!occurredAt || amount === null) return null;
  const { ref, balance } = extractCommon(text);
  return withDefaults({
    externalRef: ref,
    direction: TransactionDirection.IN,
    type: TransactionType.DEPOSIT,
    amount,
    fee: 0,
    balanceAfter: balance,
    counterpartyName: "M-PESA Deposit",
    occurredAt,
    rawText: text,
  });
}

/** "You have used Fuliza M-PESA Ksh100.00 to fully pay your transaction [REF]..." */
function tryFuliza(text: string): ParsedTransaction | null {
  if (!FULIZA.test(text)) return null;
  const re =
    /Fuliza\s+M-?PESA\s+Ksh\s*([\d,]+(?:\.\d+)?)\s+to\s+(?:fully\s+|partially\s+)?pay\s+your\s+transaction\s+([A-Z0-9]{6,12})/i;
  const m = re.exec(text);
  if (!m) return null;
  const amount = parseAmount(m[1]);
  if (amount === null) return null;
  return withDefaults({
    externalRef: `FUL-${m[2]}`,
    direction: TransactionDirection.IN,
    type: TransactionType.LOAN,
    amount,
    fee: 0,
    balanceAfter: null,
    counterpartyName: "Fuliza M-PESA",
    merchant: "Fuliza Overdraft",
    occurredAt: new Date(),
    rawText: text,
    confidence: 0.7,
  });
}

const PIPELINE = [
  tryReceivedFromPerson,
  tryPaybill,
  trySentToPerson,
  tryBuyGoods,
  tryWithdraw,
  tryAirtime,
  tryDeposit,
  tryFuliza,
] as const;

export const mpesaParser: SmsParser = {
  name: "mpesa",
  provider: AccountProvider.MPESA,
  match: (text) => HAS_MPESA.test(text) || REF.test(text),
  parse: (text): ParserResult => {
    const trimmed = text.trim();
    for (const fn of PIPELINE) {
      const tx = fn(trimmed);
      if (tx) return { tx };
    }
    return { tx: null, reason: "no_mpesa_pattern_matched" };
  },
};
