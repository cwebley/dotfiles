// Fixture telemetry forwards every production call unchanged. The loaded index and
// dependency files are byte-identical copies, with only import-relative snippets replaced.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { pathToFileURL } from 'node:url';
import { registerMock } from './integration-mock';
import { log, observeWrites } from './integration-observer';

export default async function (pi: ExtensionAPI) {
  observeWrites();
  registerMock(pi);
  let widget: any;
  (globalThis as any).__integrationWidget = () => widget;
  const contexts = new WeakMap<object, any>();
  function observedContext(ctx: any) {
    if (contexts.has(ctx)) return contexts.get(ctx);
    const ui = new Proxy(ctx.ui, {get(target, prop) {
      const original = Reflect.get(target, prop);
      if (typeof original !== 'function') return original;
      return (...args: any[]) => {
        if (prop === 'setWidget' && args[0] === 'prompt-snippets') {
          widget = args[1];
          log({event:'widget', value:widget ?? null});
        }
        if (prop === 'notify') log({event:'notification', message:args[0], level:args[1]});
        if (prop === 'custom') log({event:'production-custom-ui'});
        return original.apply(target, args);
      };
    }});
    const proxy = new Proxy(ctx, {get(target, prop) {return prop === 'ui' ? ui : Reflect.get(target, prop);}});
    contexts.set(ctx, proxy);
    return proxy;
  }
  const api = new Proxy(pi, {get(target, prop) {
    if (prop === 'on') return (event: string, handler: any) => target.on(event as any, async (e: any, ctx: any) => {
      if (event === 'input') log({event:'production-input-before', text:e.text});
      const result = await handler(e, observedContext(ctx));
      if (event === 'input') log({event:'production-input-after', original:e.text, result:result ?? null});
      if (event.startsWith('session_')) log({event:'production-'+event});
      return result;
    });
    if (prop === 'registerShortcut') return (key: string, spec: any) => target.registerShortcut(key as any, {
      ...spec, handler: (ctx: any) => spec.handler(observedContext(ctx)),
    });
    if (prop === 'registerCommand') return (name: string, spec: any) => target.registerCommand(name, {
      ...spec, handler: (args: string, ctx: any) => spec.handler(args, observedContext(ctx)),
    });
    const value = Reflect.get(target, prop);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const production = await import(pathToFileURL(process.env.INTEGRATION_PRODUCTION_ENTRY!).href);
  await production.default(api);
  pi.on('session_start', (_e, ctx) => {
    ctx.ui.setEditorText('DRAFT π café 保留');
    log({event:'ready', origin:process.env.TMUX_PANE, pid:process.pid});
  });
  pi.registerShortcut('alt+t', {description:'Read fixture observations', handler:async ctx => {
    log({event:'editor', text:ctx.ui.getEditorText(), widget:widget ?? null,
      ...(globalThis as any).__spikeUISnapshot?.()});
  }});
  // A real automatic continuation tests the boundary after input, without another input event.
  let continueOnce = false;
  pi.registerShortcut('alt+o', {description:'Arm one automatic continuation', handler:async () => {continueOnce=true;log({event:'continuation-armed'});}});
  pi.on('agent_before_settle', () => {
    if (!continueOnce) return;
    continueOnce=false;
    log({event:'continuation-requested'});
    return {continue:true};
  });
}
