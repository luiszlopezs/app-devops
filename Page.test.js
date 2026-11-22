import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html');

/** Carga la página con los timers del simulador a 0 ms. */
async function loadPage() {
  const dom = await JSDOM.fromFile(HTML, {
    runScripts: 'dangerously',
    beforeParse(win) { win.CICD_DELAY = 0; },
  });
  const { window } = dom;
  const $ = (s) => window.document.querySelector(s);
  const status = (id) => $(`[data-stage="${id}"]`).dataset.status;
  const click = async (sel) => { $(sel).click(); await window.CICD.lastRun; };
  return { window, $, status, click };
}

// ---- Lógica pura -----------------------------------------------------------

test('planRun: despliegue continuo deja todo en verde', async () => {
  const { window } = await loadPage();
  const plan = window.CICD.planRun({ mode: 'deployment' });
  assert.ok(plan.every((s) => s.status === 'success'));
});

test('planRun: un test fallido detiene las etapas siguientes', async () => {
  const { window } = await loadPage();
  const byId = Object.fromEntries(window.CICD.planRun({ failAt: 'test' }).map((s) => [s.id, s.status]));
  assert.equal(byId.build, 'success');
  assert.equal(byId.test, 'failed');
  assert.equal(byId.package, 'skipped');
  assert.equal(byId.production, 'skipped');
});

test('planRun: entrega continua exige aprobación manual en producción', async () => {
  const { window } = await loadPage();
  const prod = window.CICD.planRun({ mode: 'delivery' }).at(-1);
  assert.equal(prod.status, 'manual');
});

// ---- Página / DOM ----------------------------------------------------------

test('la página tiene título y las 6 etapas del pipeline', async () => {
  const { window, $ } = await loadPage();
  assert.match($('h1').textContent, /CI\/CD/);
  assert.equal(window.document.querySelectorAll('.stage').length, 6);
});

test('ejecutar en modo despliegue marca todo ok sin pedir aprobación', async () => {
  const { $, status, click } = await loadPage();
  await click('#run');
  assert.equal(status('production'), 'success');
  assert.equal($('#approve').hidden, true);
  assert.match($('#status').textContent, /automáticamente/);
});

test('con test fallido el pipeline se detiene y producción se omite', async () => {
  const { $, status, click } = await loadPage();
  $('#fail-test').checked = true;
  await click('#run');
  assert.equal(status('test'), 'failed');
  assert.equal(status('production'), 'skipped');
  assert.match($('#status').textContent, /detenido en «test»/);
});

test('en modo entrega aparece el botón de aprobar y despliega al pulsarlo', async () => {
  const { $, status, click } = await loadPage();
  $('#mode').value = 'delivery';
  await click('#run');
  assert.equal(status('production'), 'manual');
  assert.equal($('#approve').hidden, false);
  await click('#approve');
  assert.equal(status('production'), 'success');
  assert.equal($('#approve').hidden, true);
});

test('un nuevo run reinicia el estado anterior', async () => {
  const { $, status, click } = await loadPage();
  $('#fail-test').checked = true;
  await click('#run');
  $('#fail-test').checked = false;
  await click('#run');
  assert.equal(status('test'), 'success');
  assert.equal($('#log').children.length, 6);
});
