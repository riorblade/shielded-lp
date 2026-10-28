const top = (sel, off = 0) => `document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY + ${off}`;
export default async function (r) {
  await r.goto("http://127.0.0.1:3000/app", 22000);
  await r.move(700, 500, 10);
  await r.start();
  r.mark("top");
  await r.sleep(1200);
  r.mark("slices");
  await r.scrollTo(top(".slices", -90), 1200);
  await r.sleep(2500);
  r.mark("back");
  await r.scrollTo(0, 1000);
  const w = await r.at(".wallet-chip");
  if (w) await r.move(w.x, w.y, 600);
  await r.sleep(2200);
  r.mark("end");
}
