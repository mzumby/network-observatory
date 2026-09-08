function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeGmailMessage(value) {
  const message = asRecord(value);
  const payload = asRecord(message.payload);
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const allowed = new Set(["from", "to", "cc", "bcc", "date"]);
  const cleanHeaders = {};

  for (const header of headers.slice(0, 100)) {
    const item = asRecord(header);
    const name = cleanText(item.name, 32).toLowerCase();
    if (allowed.has(name)) {
      const cleanValue = cleanText(item.value, 1_000);
      if (cleanValue) cleanHeaders[name] = cleanValue;
    }
  }

  const internalDate = cleanText(message.internalDate, 20);
  return {
    id: cleanText(message.id, 256),
    threadId: cleanText(message.threadId, 256),
    labelIds: Array.isArray(message.labelIds)
      ? message.labelIds
          .map((item) => cleanText(item, 128))
          .filter(Boolean)
          .slice(0, 100)
      : [],
    internalDate: /^\d{1,20}$/.test(internalDate) ? internalDate : "",
    headers: cleanHeaders,
  };
}
