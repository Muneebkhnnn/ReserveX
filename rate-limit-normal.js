const url = "http://localhost:3000/api/orders";

for (let i = 1; i <= 5; i++) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: `normal-${i}`,
      ticketId: `ticket-${i + 10}`
    })
  });

  console.log(`Request ${i}: ${res.status}`);

  await new Promise(r => setTimeout(r, 2000));
}