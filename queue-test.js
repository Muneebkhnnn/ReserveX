const TOTAL = Number(process.argv[2] || 50);

for (let i = 1; i <= TOTAL; i++) {
  try {
    const res = await fetch("http://localhost:4003/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: `user-${i}`,
        ticketId: `ticket-${i}`,
      }),
    });

    console.log(`#${i}: ${res.status}`);
  } catch (err) {
    console.log(`#${i}: ERROR`);
  }
}