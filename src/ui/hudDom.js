// Root-scoped DOM effects; callers supply positions in the app's pre-rotation coordinates.
export function makeHud(root){
  const doc=root.ownerDocument;
  let toastTimer=0,bubbleTimer=0,coachTimer=0,stampTimer=0;
  function element(cls){
    let el=root.querySelector("."+cls);
    if(!el){el=doc.createElement("div");el.className=cls;root.appendChild(el);}
    return el;
  }
  function toast(msg,ms=1200){
    const t=element("toast");t.textContent=msg;t.classList.add("show");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),ms);
  }
  function hideCoach(){clearTimeout(coachTimer);root.querySelector(".coach")?.classList.remove("show");}
  function hideSpeech(){clearTimeout(bubbleTimer);root.querySelector(".bubble")?.classList.remove("show");}
  function say(text,ms=1800,loud=false){
    hideCoach();
    const b=element("bubble");b.textContent=text;b.classList.add("show");
    b.classList.remove("loud");if(loud){void b.offsetWidth;b.classList.add("loud");}
    clearTimeout(bubbleTimer);bubbleTimer=setTimeout(()=>b.classList.remove("show"),ms);
  }
  function coach(text,ms=1600){
    const c=element("coach");c.textContent="";
    const who=doc.createElement("small");who.textContent="선생님";c.append(who,text);
    c.classList.add("show");hideSpeech();
    clearTimeout(coachTimer);coachTimer=setTimeout(()=>c.classList.remove("show"),ms);
  }
  function stamp(word,sub,kind,ms=1700,by=""){
    const s=element("stamp-card");s.textContent="";
    const b=doc.createElement("b");b.textContent=word;
    const sm=doc.createElement("small");sm.textContent=sub;s.append(b,sm);if(by){const bw=doc.createElement("small");bw.className="by";bw.textContent=by;s.append(bw);}
    s.className="stamp-card";void s.offsetWidth;s.className="stamp-card show "+kind;
    clearTimeout(stampTimer);stampTimer=setTimeout(()=>s.classList.remove("show"),ms);
  }
  function floater(text,x,y,cls,ms=1000){
    const el=doc.createElement("div");el.className="float"+(cls?" "+cls:"");el.textContent=text;
    el.style.left=x+"px";el.style.top=y+"px";root.appendChild(el);setTimeout(()=>el.remove(),ms);
  }
  return {toast,say,coach,hideCoach,hideSpeech,stamp,floater};
}
