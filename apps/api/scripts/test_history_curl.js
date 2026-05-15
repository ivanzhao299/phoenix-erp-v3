const clientId = "A226871";
const clientSecret = "13f053dc44781745778dcbcdae7c3e55";
const base = "https://iot.xiaojuyun.com";

async function test() {
  const tokenRes = await fetch(`${base}/open/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret })
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.data.accessToken;

  const res = await fetch(`${base}/open/api/house/device/property/date/data/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({
      houseId: '1248',
      date: '2026-05-08',
      propertyCodes: ["2001", "2002"]
    })
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}
test().catch(console.error);
