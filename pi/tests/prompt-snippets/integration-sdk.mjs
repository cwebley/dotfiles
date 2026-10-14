// Real installed SDK InteractiveMode, in-memory sessions/settings, isolated resources.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const sdk = await import(pathToFileURL(process.env.INTEGRATION_SDK_ENTRY).href);
const {SettingsManager, SessionManager, createAgentSessionRuntime,
  createAgentSessionServices, createAgentSessionFromServices, InteractiveMode} = sdk;
const args=process.argv.slice(2);
const arg=name=>args[args.indexOf(name)+1];
const cwd=process.cwd(), agentDir=process.env.PI_CODING_AGENT_DIR;
const settings=SettingsManager.inMemory({terminal:{showTerminalProgress:true},
  compaction:{enabled:false},retry:{enabled:false},theme:'dark'});
const factory=async ({cwd,sessionManager,sessionStartEvent}) => {
  const services=await createAgentSessionServices({cwd,agentDir,settingsManager:settings,
    resourceLoaderOptions:{noExtensions:true,additionalExtensionPaths:[arg('-e')],
      noSkills:true,additionalSkillPaths:[process.env.INTEGRATION_SKILL],
      noPromptTemplates:true,additionalPromptTemplatePaths:[process.env.INTEGRATION_TEMPLATE],
      noThemes:true,noContextFiles:true},
  });
  const model=services.modelRuntime.getModel('offline-spike','stream-tools');
  if(!model) throw new Error('Offline provider missing');
  const result=await createAgentSessionFromServices({services,sessionManager,sessionStartEvent,
    model,thinkingLevel:'off',tools:['spike_wait']});
  return {...result,services,diagnostics:services.diagnostics};
};
const runtime=await createAgentSessionRuntime(factory,{cwd,agentDir,
  sessionManager:SessionManager.inMemory(cwd)});
fs.appendFileSync(process.env.SPIKE_LOG,JSON.stringify({event:'sdk-settings',progress:settings.getShowTerminalProgress(),storage:'in-memory'})+'\n');
const ui=new InteractiveMode(runtime,{tuiMode:arg('--tui-mode'),initialThemeSetting:'dark'});
globalThis.__spikeUISnapshot=()=>({text:ui.editor.getText(),widget:globalThis.__integrationWidget?.() ?? null,editorChildren:ui.editorContainer.children.map(c=>c.fixtureDialog?'tool-dialog':c.constructor.name),
  focus:ui.ui.focusedComponent?.fixtureDialog?'tool-dialog':ui.ui.focusedComponent?.constructor.name});
await ui.run();
