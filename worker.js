// worker.js — el "servidor" de Cambio Bermu (Cloudflare Workers con archivos estáticos).
//
// Qué hace, en cristiano:
//  1) Si alguien pide /api/precios, este archivo consulta Crypto.com (criptos)
//     y Frankfurter (tipo EUR/USD oficial del BCE), junta los datos y los devuelve.
//  2) Cualquier otra petición (la página, imágenes...) se entrega tal cual desde la carpeta public/.
//
// Por qué se hace aquí y no en el navegador: así el navegador solo habla con TU dominio
// (sin problemas de CORS), y la respuesta se guarda 30 s en la caché de Cloudflare:
// si entran 1.000 personas, Crypto.com recibe 2 consultas por minuto, no 1.000.

// Pares que usa la calculadora. Si quieres otra cripto, añade aquí BTC_USD y BTC_EUR del estilo "LTC_USD"/"LTC_EUR".
const PARES = [
  "USDT_USD",
  "BTC_USD", "ETH_USD", "SOL_USD", "XRP_USD",
  "BTC_EUR", "ETH_EUR", "SOL_EUR", "XRP_EUR",
];

const TICKERS_URL = "https://api.crypto.com/exchange/v1/public/get-tickers";
const BCE_URL = "https://api.frankfurter.dev/v2/rate/eur/usd";
const SEGUNDOS_CACHE = 30;

const num = (x) => (x === null || x === undefined || x === "" ? NaN : Number(x));

// Convierte la respuesta de Crypto.com en { "BTC_USD": { last, change, ts }, ... }.
// Campos según la documentación oficial: i = par, a = último precio, b = mejor compra,
// k = mejor venta, c = cambio en 24 h (en fracción: -0.01 = -1 %), t = hora en milisegundos.
export function leerTickers(json) {
  const salida = {};
  const lista = (json && json.result && json.result.data) || [];
  for (const t of lista) {
    if (!PARES.includes(t.i)) continue;
    let last = num(t.a);
    if (!isFinite(last)) {
      // Sin operaciones recientes: usamos el punto medio entre compra y venta.
      const b = num(t.b), k = num(t.k);
      last = isFinite(b) && isFinite(k) ? (b + k) / 2 : NaN;
    }
    if (!isFinite(last) || last <= 0) continue;
    const change = num(t.c);
    salida[t.i] = { last, change: isFinite(change) ? change : null, ts: num(t.t) || Date.now() };
  }
  return salida;
}

async function pedirJSON(url) {
  const r = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(url.split("/")[2] + " respondió " + r.status);
  return r.json();
}

async function construirPrecios() {
  // Las dos consultas salen a la vez: si una falla, la otra sigue valiendo.
  const [cripto, bce] = await Promise.allSettled([pedirJSON(TICKERS_URL), pedirJSON(BCE_URL)]);

  let tickers = cripto.status === "fulfilled" ? leerTickers(cripto.value) : {};

  // Si el listado general no trajo algún par, lo pedimos suelto.
  const faltan = PARES.filter((p) => !tickers[p]);
  if (cripto.status === "fulfilled" && faltan.length && faltan.length < PARES.length) {
    const sueltos = await Promise.allSettled(
      faltan.map((p) => pedirJSON(TICKERS_URL + "?instrument_name=" + p))
    );
    for (const s of sueltos) if (s.status === "fulfilled") Object.assign(tickers, leerTickers(s.value));
  }

  let eurUsd = null;
  if (bce.status === "fulfilled" && num(bce.value && bce.value.rate) > 0) {
    eurUsd = { rate: num(bce.value.rate), date: bce.value.date || null, source: "BCE" };
  }

  const errores = [];
  if (cripto.status === "rejected") errores.push("Crypto.com: " + cripto.reason.message);
  if (bce.status === "rejected") errores.push("BCE: " + bce.reason.message);

  return { generated: new Date().toISOString(), tickers, eurUsd, errores };
}

// Memoria propia del Worker (vale mientras el Worker siga "despierto"): refuerza la caché de Cloudflare,
// que no funciona en direcciones *.workers.dev pero sí en tu dominio propio.
let memo = null;

async function precios(ctx) {
  if (memo && Date.now() - memo.t < SEGUNDOS_CACHE * 1000) {
    return new Response(memo.body, { headers: memo.headers });
  }
  const cache = caches.default;
  // Clave fija de caché (no depende del dominio exacto ni de parámetros).
  const clave = new Request("https://cambio-bermu.cache/api/precios");

  const guardado = await cache.match(clave);
  if (guardado) return guardado;

  const datos = await construirPrecios();
  const hayPrecios = Object.keys(datos.tickers).length > 0;

  const respuesta = new Response(JSON.stringify(datos), {
    status: hayPrecios ? 200 : 502,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Con datos: 30 s de caché. Sin datos: no se guarda para reintentar enseguida.
      "cache-control": hayPrecios ? "public, max-age=" + SEGUNDOS_CACHE : "no-store",
    },
  });
  if (hayPrecios) {
    memo = { t: Date.now(), body: JSON.stringify(datos), headers: Object.fromEntries(respuesta.headers) };
    ctx.waitUntil(cache.put(clave, respuesta.clone()));
  }
  return respuesta;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/precios" && request.method === "GET") return precios(ctx);
    return env.ASSETS.fetch(request); // todo lo demás: tu index.html y compañía
  },
};
