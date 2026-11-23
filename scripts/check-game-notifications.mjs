import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import toast from 'react-hot-toast';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/HUD/GameNotifications.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/components/HUD/GameNotifications.css', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replace(/^import '\.\/GameNotifications\.css';\s*$/m, '')
  .replace(/^import "\.\/GameNotifications\.css";\s*$/m, '')
  .replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_all, _quote, name) => `from '${import.meta.resolve(name)}'`);
const { GameNotifications } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
const render = (achievement) => renderToStaticMarkup(createElement(GameNotifications, {achievement}));

assert.doesNotMatch(source, /getBoundingClientRect|offsetHeight|scrollHeight|clientHeight|MutationObserver|calculateOffset|updateHeight|ToastBar/);
assert.match(css, /flex-direction:\s*column/);
assert.match(css, /gap:\s*8px/);
assert.match(css, /pointer-events:\s*none/);
assert.match(css, /pointer-events:\s*auto/);

let customResolved = false;
toast.remove();
try {
  const impact = toast('Napalm impact · 3 targets caught in the burn');
  const failure = toast.error('Could not trash folder', {
    position: 'bottom-left', ariaProps: { role: 'alert', 'aria-live': 'assertive' },
  });
  const success = toast.success('Armor restored · back in the fight');
  const achievement = toast.custom(notice => {
    customResolved = notice.visible;
    return createElement('span', null, 'Custom achievement');
  }, { position: 'top-center' });

  const markup = render();
  assert.match(markup, /data-rht-toaster="default"/);
  assert.match(markup, /data-game-ui="true"/);
  assert.doesNotMatch(markup, /Napalm impact|Armor restored/);
  assert.match(markup, /role="alert" aria-live="assertive">Could not trash folder/);
  assert.match(markup, /data-position="bottom-left"/);
  assert.ok(customResolved && markup.includes('<span>Custom achievement</span>'));
  const medal = render(createElement('span', null, 'Grid Cleaner'));
  assert.match(medal, /role="status" aria-live="polite"><span>Grid Cleaner/);
  assert.doesNotMatch(medal, /Custom achievement|Armor restored|Napalm impact/);
  toast.dismiss(achievement);
  assert.match(render(), /Armor restored/);
  assert.doesNotMatch(render(), /Napalm impact/);

  toast.dismiss(impact);
  assert.doesNotMatch(render(), /Napalm impact|Custom achievement/);
  toast.remove(success);
  toast.remove(failure);
  assert.doesNotMatch(render(), /data-position=/);
} finally {
  toast.remove();
}

console.log('Game notification checks passed: real store messages, dismissal, ordering, placement, custom content, and live ARIA without measured layout.');
