// Offline test fixture, not a production provider. No HTTP or SDK client exists here.
import { createAssistantMessageEventStream, getCurrentTools, getCurrentSystemPrompt, Type,
  type AssistantMessage, type Api, type Model, type TranscriptContext, type SimpleStreamOptions,
} from '@earendil-works/pi-ai';
import { defineTool, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { setTimeout as delay } from 'node:timers/promises';
import { log } from './integration-observer';

export function registerMock(pi: ExtensionAPI) {
  let request = 0;
  let dialogUsed = false;
  function streamSimple(model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) {
    const stream = createAssistantMessageEventStream();
    const call = ++request;
    const followup = context.messages.at(-1)?.role === 'toolResult';
    const output: AssistantMessage = {
      role:'assistant', content:[], api:model.api, provider:model.provider, model:model.id,
      stopReason:'pending', timestamp:Date.now(),
      usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},
    };
    void (async () => {
      try {
        let payload: any = {call, followup, steps:20};
        const replacement = await options?.onPayload?.(payload, model);
        if (replacement !== undefined) payload = replacement;
        // A synthetic response exercises Pi's instrumentation without a transport.
        await options?.onResponse?.({status:200, headers:{'x-offline-fixture':'true'}}, model);
        log({event:'mock-request', call, followup, messages:context.messages,
          system:getCurrentSystemPrompt(context.messages), toolNames:getCurrentTools(context.messages).map(t=>t.name)});
        async function emit(event: any) {
          await options?.onProviderStreamEvent?.({type:event.type, call, delta:event.delta}, model);
          stream.push(event);
        }
        options?.signal?.throwIfAborted();
        await emit({type:'start', partial:output});
        output.content.push({type:'text', text:''});
        await emit({type:'text_start', contentIndex:0, partial:output});
        for (let i=1; i<=payload.steps; i++) {
          await delay(100, undefined, {signal:options?.signal});
          const delta = `MOCK_${followup ? 'FOLLOWUP' : 'INITIAL'}_${i.toString().padStart(2,'0')} `;
          (output.content[0] as any).text += delta;
          await emit({type:'text_delta', contentIndex:0, delta, partial:output});
          log({event:'mock-delta', call, step:i});
        }
        await emit({type:'text_end', contentIndex:0, content:(output.content[0] as any).text, partial:output});
        if (!followup) {
          const tool = {type:'toolCall' as const, id:`offline-${call}`, name:'spike_wait', arguments:{}};
          output.content.push(tool);
          await emit({type:'toolcall_start', contentIndex:1, partial:output});
          tool.arguments = {ticks:8};
          await emit({type:'toolcall_delta', contentIndex:1, delta:'{"ticks":8}', partial:output});
          await emit({type:'toolcall_end', contentIndex:1, toolCall:tool, partial:output});
        }
        output.usage.output = payload.steps;
        output.usage.totalTokens = payload.steps;
        output.stopReason = followup ? 'stop' : 'toolUse';
        await emit({type:'done', reason:output.stopReason, message:output});
        log({event:'mock-done', call, reason:output.stopReason});
      } catch (error) {
        output.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
        output.errorMessage = String(error);
        stream.push({type:'error', reason:output.stopReason, error:output});
        log({event:'mock-error', call, reason:output.stopReason, error:String(error)});
      } finally { stream.end(); }
    })();
    return stream;
  }
  pi.registerProvider('offline-spike', {
    baseUrl:'https://offline-spike.invalid', apiKey:'offline-fixture-not-a-credential', api:'offline-spike-api', streamSimple,
    models:[{id:'stream-tools',name:'Offline stream + tool fixture',reasoning:false,input:['text'],
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow:200000,maxTokens:1024}],
  });
  pi.registerTool(defineTool({
    name:'spike_wait',label:'Offline tick tool',description:'Generate local asynchronous tool updates',
    parameters:Type.Object({ticks:Type.Number()}),
    async execute(_id, params, signal, onUpdate, ctx) {
      for (let i=1;i<=params.ticks;i++) {
        await delay(100, undefined, {signal});
        onUpdate?.({content:[{type:'text',text:`MOCK_TOOL_UPDATE_${i}`}],details:{tick:i}});
        log({event:'mock-tool-tick',step:i});
        if (process.env.SPIKE_DIALOG === '1' && i===2 && !dialogUsed) {
          dialogUsed = true;
          log({event:'tool-dialog-requested'});
          const result=await ctx.ui.custom<string | undefined>((_tui,_theme,_keys,done) => {
            log({event:'tool-dialog-factory'});
            const component={fixtureDialog:true,render:()=>['OFFLINE TOOL DIALOG. Enter accepts.'],invalidate(){},handleInput(data:string){if(data==='\r')done('allow');else if(data==='\x1bt')log({event:'editor',...(globalThis as any).__spikeUISnapshot()});else if(data==='\x1bx')done(undefined);},dispose(){log({event:'tool-dialog-disposed'});}};
            (globalThis as any).__spikeCancelDialog=()=>done(undefined);
            setTimeout(()=>log({event:'tool-dialog-installed',...(globalThis as any).__spikeUISnapshot()}),0);
            return component;
          });
          log({event:'tool-dialog-resolved',result});
        }
      }
      return {content:[{type:'text',text:'MOCK_TOOL_COMPLETE'}],details:{ticks:params.ticks}};
    },
  }));
  for (const event of ['agent_start','agent_end','agent_settled','turn_start','turn_end','tool_execution_start','tool_execution_update','tool_execution_end','provider_request','provider_response'] as const) {
    pi.on(event as any, (e:any, ctx) => log({event, idle:ctx.isIdle(), toolName:e.toolName, isError:e.isError}));
  }
  for (const event of ['ui_prompt_start','ui_prompt_end'] as const) {
    pi.on(event, e => log({event,kind:e.kind,title:e.title,...(globalThis as any).__spikeUISnapshot()}));
  }
  pi.registerShortcut('alt+x',{description:'Bounded fixture cleanup of stranded tool custom UI',handler:async()=>{
    log({event:'tool-dialog-fixture-cleanup',...(globalThis as any).__spikeUISnapshot()});
    (globalThis as any).__spikeCancelDialog?.();
  }});
  pi.on('message_update', (e, ctx) => log({event:'message_update',type:e.assistantMessageEvent.type,idle:ctx.isIdle()}));
  pi.on('message_end', e => log({event:'message_end',role:e.message.role,stopReason:(e.message as any).stopReason}));
  pi.on('provider_stream_event', e => log({event:'provider_stream_event', type:(e.data as any).type}));
  pi.registerShortcut('alt+r', {description:'Start actual agent with offline provider',handler:async ctx=>{
    log({event:'start-requested',draft:ctx.ui.getEditorText(),model:ctx.model?.provider+'/'+ctx.model?.id});
    pi.sendUserMessage('Run the deterministic offline stream and local tick tool.');
  }});
}
