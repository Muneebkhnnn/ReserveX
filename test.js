const ticketId = process.argv[2];
const concurrency = Number(process.argv[3] || 10);

const url = `http://localhost:4002/tickets/${ticketId}/reserve`;

const requests = Array.from({ length: concurrency }, async () => {
  const res = await fetch(url, { method: "POST" });

  let body = {};
  try {
    body = await res.json();
  } catch {}

  return { status: res.status, body };
});

const results = await Promise.all(requests);

const counts = {};
for (const r of results) {
  const key =
    r.status === 409 && r.body.error
      ? `409 - ${r.body.error}`
      : `${r.status}`;
  counts[key] = (counts[key] || 0) + 1;
}

console.log(`\n=== Concurrency: ${concurrency} ===`);
console.table(counts);