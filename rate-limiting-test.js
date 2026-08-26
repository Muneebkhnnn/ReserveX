const TOTAL = Number(process.argv[2] || 10);

const url = "http://localhost:3000/api/orders";

const requests = Array.from({ length: TOTAL }, async () => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "rate-user",
      ticketId: "ticket-1"
    })
  });

  return res.status;
});

const results = await Promise.all(requests);

const counts = {};
for (const status of results) {
  counts[status] = (counts[status] || 0) + 1;
}

console.table(counts);