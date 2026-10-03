/**
 * The in-ChatGPT book-plan card. Plain HTML + inline JS (no bundler, no external
 * requests), so its CSP needs no connect or resource domains. It talks to the
 * host through window.openai when present and the MCP Apps postMessage bridge
 * otherwise. Every tool also returns full text content, so ChatGPT can still
 * answer when this card cannot render.
 */
export const WIDGET_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fffdf9;--ink:#1d1a16;--muted:#6b6259;--line:#e7dfd4;--accent:#b4542b;--accent-ink:#fff;--warn:#8a5a00;--chip:#f4ece2}
@media (prefers-color-scheme:dark){:root{--bg:#1b1916;--ink:#f3ede4;--muted:#b4aa9d;--line:#3a352e;--accent:#e0875c;--accent-ink:#1b1916;--warn:#e6b450;--chip:#2a2621}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Georgia,"Times New Roman",serif}
.wrap{padding:16px;max-width:760px}h1{font-size:20px;margin:0 0 4px}
.label{display:inline-block;font:600 12px/1 system-ui,sans-serif;background:var(--chip);padding:5px 8px;border-radius:999px;margin:4px 0 10px}
.meta{color:var(--muted);font-size:14px;margin:2px 0}
ol{padding-left:0;list-style:none;margin:12px 0}li{border-top:1px solid var(--line);padding:8px 0}
summary{cursor:pointer;font-weight:600}summary:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.refs{font:12px/1.4 system-ui,sans-serif;color:var(--muted);margin-top:4px}
.quote{margin:6px 0 6px 12px;color:var(--muted);font-style:italic}.quote::before{content:"\201C"}.quote::after{content:"\201D"}
.gaps{background:var(--chip);border-radius:10px;padding:10px 12px;margin:12px 0}.gaps h2{font:600 13px system-ui,sans-serif;margin:0 0 6px;color:var(--warn)}
.gaps ul{margin:0;padding-left:18px}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
button{font:600 14px system-ui,sans-serif;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--ink);padding:9px 14px;cursor:pointer;min-height:40px}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}button[disabled]{opacity:.55;cursor:default}
#status{font:13px system-ui,sans-serif;color:var(--muted);min-height:1.2em;margin-top:8px}
</style></head><body><main class="wrap" id="app"><p class="meta">Loading the plan...</p></main>
<script>
(function(){
  var app=document.getElementById("app"), data=null, segments=[], busy=false;
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c];});}
  var rpcId=0, pending={};
  function bridge(method,params){return new Promise(function(res,rej){var id=++rpcId;pending[id]={res:res,rej:rej};window.parent.postMessage({jsonrpc:"2.0",id:id,method:method,params:params},"*");});}
  window.addEventListener("message",function(e){var m=e.data;if(!m||m.jsonrpc!=="2.0")return;
    if(m.id&&pending[m.id]){(m.error?pending[m.id].rej:pending[m.id].res)(m.error||m.result);delete pending[m.id];return;}
    if(m.method==="ui/notifications/tool-result"&&m.params){ingest(m.params.structuredContent,m.params._meta);}
  });
  function callTool(name,args){ if(window.openai&&window.openai.callTool)return window.openai.callTool(name,args); return bridge("tools/call",{name:name,arguments:args}); }
  function openLink(url){ if(window.openai&&window.openai.openExternal)return window.openai.openExternal({href:url}); window.open(url,"_blank","noopener"); }
  function followUp(text){ if(window.openai&&window.openai.sendFollowUpMessage)return window.openai.sendFollowUpMessage({prompt:text}); return bridge("ui/message",{role:"user",content:[{type:"text",text:text}]}); }
  function status(t){var s=document.getElementById("status");if(s)s.textContent=t;}
  function ingest(sc,meta){ if(!sc)return; data=sc; if(meta&&meta.segments)segments=meta.segments; render(); }
  function segText(id){for(var i=0;i<segments.length;i++)if(segments[i].id===id)return segments[i].text;return "";}
  function render(){
    if(!data){return;}
    if(data.error){app.innerHTML='<h1>Book plan</h1><p>'+esc(data.error.message)+'</p>';return;}
    var plan=data.plan; if(!plan){app.innerHTML='<p class="meta">No plan in this result.</p>';return;}
    var label=plan.input_mode==="idea"?"Provisional: nothing here is quoted from you yet":plan.input_mode==="import"?"Imported as you wrote it":"Built from the material you shared";
    var h='<h1>'+esc(plan.title)+'</h1><span class="label">'+esc(label)+'</span>';
    if(plan.intended_reader)h+='<p class="meta"><strong>Reader:</strong> '+esc(plan.intended_reader)+'</p>';
    if(plan.promise)h+='<p class="meta"><strong>Promise:</strong> '+esc(plan.promise)+'</p>';
    h+='<ol aria-label="Chapters">';
    plan.chapters.forEach(function(c){
      h+='<li><details><summary>'+c.order+'. '+esc(c.title)+'</summary>';
      if(c.summary)h+='<p>'+esc(c.summary)+'</p>';
      if(c.source_refs&&c.source_refs.length){h+='<div class="refs">Sources: '+c.source_refs.map(function(r){return esc(r.segment_id);}).join(", ")+'</div>';
        c.source_refs.forEach(function(r){var q=r.quote||segText(r.segment_id).slice(0,220);if(q)h+='<p class="quote">'+esc(q)+'</p>';});}
      h+='</details></li>';
    });
    h+='</ol>';
    if(plan.gaps&&plan.gaps.length){h+='<section class="gaps" aria-label="Gaps"><h2>What is still missing</h2><ul>'+plan.gaps.map(function(g){return '<li>'+esc(g)+'</li>';}).join("")+'</ul></section>';}
    h+='<div class="row">';
    if(data.saved&&data.project_url){h+='<button class="primary" id="open">Continue in D.scribe</button>';}
    else{h+='<button class="primary" id="save">Save to D.scribe</button><button id="refine">Change something</button>';}
    h+='</div><div id="status" role="status" aria-live="polite"></div>';
    app.innerHTML=h;
    var o=document.getElementById("open");if(o)o.onclick=function(){openLink(data.project_url);};
    var r=document.getElementById("refine");if(r)r.onclick=function(){followUp("I'd like to change this book plan: ");};
    var s=document.getElementById("save");if(s)s.onclick=save;
  }
  function save(){
    if(busy||!data||!data.preview_id)return; busy=true; var b=document.getElementById("save"); if(b)b.disabled=true; status("Saving...");
    Promise.resolve(callTool("save_book_plan",{preview_id:data.preview_id,claim_token:data.claim_token})).then(function(res){
      busy=false; var sc=res&&(res.structuredContent||(res.result&&res.result.structuredContent));
      if(sc&&sc.saved){data=Object.assign({},data,sc);render();status("Saved as a new project. Nothing existing was changed.");return;}
      var msg=sc&&sc.error?sc.error.message:"Could not save. Ask ChatGPT to save the plan to D.scribe.";
      if(b)b.disabled=false; status(msg);
    },function(){busy=false;if(b)b.disabled=false;status("Could not save. Ask ChatGPT to save the plan to D.scribe.");});
  }
  if(window.openai&&window.openai.toolOutput){ingest(window.openai.toolOutput,window.openai.toolResponseMetadata);}
  window.addEventListener("openai:set_globals",function(){if(window.openai&&window.openai.toolOutput)ingest(window.openai.toolOutput,window.openai.toolResponseMetadata);});
  bridge("ui/initialize",{}).catch(function(){});
})();
</script></body></html>`;
