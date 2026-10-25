# Cambio Bermu · versión Workers (la que Cloudflare te está proponiendo)

Estructura (respétala, incluida la carpeta `public`):

```
wrangler.jsonc     <- configuración: qué archivo es el servidor y dónde está la página
worker.js          <- el servidor: atiende /api/precios (Crypto.com + BCE)
public/index.html  <- la calculadora
```

## Qué falló antes
Cloudflare estaba tratando tu repositorio como un Worker con archivos estáticos y se negó a subir `_worker.js` como si fuera una página pública, para no exponer código del servidor. Aquí `worker.js` va declarado como servidor en `wrangler.jsonc`, y solo `public/` es público.

## Pasos (con GitHub)
1. **Crea un repositorio NUEVO** en GitHub (por ejemplo `cambio-bermu`). No uses el repositorio de efectobermu.com: este proyecto trae su propio `index.html` y lo pisaría.
2. En el repositorio: **Add file → Upload files** y arrastra `wrangler.jsonc`, `worker.js` y la carpeta `public` entera. **Commit changes**.
3. En Cloudflare: **Workers & Pages → Create application → Import a repository** (conectar con Git), elige `cambio-bermu`.
4. En la configuración de compilación:
   - Comando de compilación (Build command): **vacío**
   - Comando de implementación (Deploy command): `npx wrangler deploy`
   - Directorio raíz: déjalo como está
5. **Save and Deploy**.

## Comprobar
- `https://cambio-bermu.TU-USUARIO.workers.dev/api/precios` debe mostrar `tickers` y `eurUsd`. Si `errores` sale vacío, perfecto.
- La página principal debe decir **En vivo**.

## Dominio propio
Proyecto → **Settings → Domains & Routes → Add → Custom domain** (por ejemplo `cambio.efectobermu.com`). Con dominio propio la caché de 30 s funciona al máximo.

## Si prefieres no usar Git
Con `wrangler` desde tu ordenador: dentro de la carpeta, `npx wrangler deploy`.
