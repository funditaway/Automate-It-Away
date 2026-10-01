function visitorLine(s) {
  return String(s || "")
    .replace(/Over \$250 waits on the owner\.?/gi, "")
    .replace(/Money over \$250[^.]*\.?/gi, "")
    .replace(/You tap Send or Stop\.?/gi, "")
    .replace(/until (GOOGLE_CLIENT_ID is )?on the box\.?/gi, "")
    .replace(/the key is on the box\.?/gi, "")
    .replace(/Grok recs/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
