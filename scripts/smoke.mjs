// Smoke test de producción: compila, arranca dist/main y consulta /health.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const PUERTO = 3099;
const ESPERA_MAXIMA_MS = 20_000;

const build = spawnSync('pnpm', ['build'], { stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error('SMOKE FALLÓ: la compilación terminó con error.');
  process.exit(1);
}

const servidor = spawn('node', ['dist/main'], {
  stdio: 'inherit',
  env: {
    FRONTEND_URL: 'http://localhost:3000',
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PUERTO),
  },
});

let servidorCaido = false;
servidor.on('exit', () => {
  servidorCaido = true;
});

async function consultarHealth() {
  try {
    const respuesta = await fetch(`http://localhost:${PUERTO}/health`);
    return respuesta.ok ? await respuesta.json() : null;
  } catch {
    return null;
  }
}

const inicio = Date.now();
let resultado = null;
while (!servidorCaido && Date.now() - inicio < ESPERA_MAXIMA_MS && !resultado) {
  resultado = await consultarHealth();
  if (!resultado) await new Promise((resolver) => setTimeout(resolver, 500));
}

// Se espera el cierre del servidor y se evita process.exit() (en Windows provoca un
// "Assertion failed" de libuv con handles aún cerrándose).
if (!servidorCaido) {
  servidor.kill();
  await once(servidor, 'exit');
}

if (resultado?.estado === 'ok') {
  console.log('SMOKE OK: /health respondió', JSON.stringify(resultado));
} else {
  console.error(
    'SMOKE FALLÓ: /health no respondió ok',
    servidorCaido ? '(el servidor se cerró)' : '(tiempo agotado)',
  );
  process.exitCode = 1;
}
