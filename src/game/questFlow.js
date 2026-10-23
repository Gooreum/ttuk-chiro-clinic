/* 단골 의뢰 wiring (core/quests.js, ui/quests.js): 영업 일지 -> 의뢰 -> the story card -> 의뢰 시작 (the tap that runs
   start(), so the iOS permission calls stay inside the user gesture, AGENTS.md 3-5) -> result card -> dayEnd's twin
   `end`. A quest run is a free-play run (S.day = -1) with S.quest set, so nothing campaign-only (stars of a day,
   boss ads, best score) touches it. */
import { t } from "../i18n/index.js";
import { $ } from "../lib/dom.js";
import { store } from "../lib/store.js";
import { S } from "./state.js";
import { CAMPAIGN_KEY, readProgress } from "../core/campaign.js";
import { QUESTS, afterQuest, questClears, questStarsOf, questStars } from "../core/quests.js";
import { renderQuests, showQuestStory } from "../ui/quests.js";
import { renderDexBtn } from "./dex.js";
import { track } from "../platform/analytics.js";
import { EV } from "../core/analytics.js";

export function mountQuests({ start, back }){
  const prog = () => readProgress(store.get(CAMPAIGN_KEY, null));
  const toDaysText = $("#toDays").textContent;
  const qf = {
    sel: -1,
    /* the campaign story card takes over again */
    reset(){ qf.sel = -1; $("#storyBack").textContent = t("일지로"); },
    sync(quest){ $("#toDays").textContent = quest >= 0 ? t("의뢰 목록") : toDaysText; },
    list(){
      qf.reset();
      $("#days").hidden = true; $("#story").hidden = true;
      renderQuests(prog(), i => qf.story(i));
    },
    story(i){ qf.sel = i; $("#quests").hidden = true; showQuestStory(QUESTS[i]); },
    go(){
      const q = QUESTS[qf.sel], no = qf.sel;
      track(EV.questStart, { quest_no: no + 1, quest: q.id, who: q.who, rule: q.rule, game: q.game });
      $("#quests").hidden = true;
      start(q.game, -1, false, 0, no);
    },
    /* the result card of a quest run (flow.js finish -> dayEnd) */
    end(complete, avg){
      const q = QUESTS[S.quest], cleared = questClears(q, complete, avg), stars = cleared ? questStarsOf(q, avg) : 0;
      const before = prog(), after = afterQuest(before, q, cleared, stars);
      if(after !== before) store.set(CAMPAIGN_KEY, after);
      $("#rdate").textContent = t("단골 의뢰 · {who} {title}",{who:t(q.who),title:t(q.title)});
      const out = $("#dayOutro");
      out.textContent = cleared ? t(q.outro) : complete ? t("평균 {a}점. {b}점을 못 넘었어요. 손 풀고 다시 와요.",{a:Math.round(avg),b:q.beat}) : t("의뢰를 못 버텼어요. 다시 문 열어 봐요.");
      out.hidden = false;
      document.querySelectorAll(".tale-new").forEach(e => e.remove());
      if(cleared && questStars(before, q) === 0){   // 뒷이야기: 처음 깬 의뢰는 도감 카드에 한 줄이 적힌다
        const p = document.createElement("p"); p.className = "dex-new tale-new";
        p.textContent = t("도감에 뒷이야기가 적혔어요: {who} {ep}편",{who:t(q.who),ep:q.ep});
        $("#rlist").before(p);
      }
      renderDexBtn();
      $("#nextDay").hidden = true;
      $("#toDays").hidden = false;
      $("#again").textContent = t(cleared ? "이 의뢰 다시" : "다시 도전");
      track(EV.questEnd, { quest_no: S.quest + 1, quest: q.id, who: q.who, rule: q.rule, game: q.game, cleared, stars, score: S.score, run_ms: Math.round(performance.now() - S.runAt) });
    }
  };
  $("#questOpen").addEventListener("click", () => { qf.list(); });
  $("#questClose").addEventListener("click", () => { $("#quests").hidden = true; back(); });
  return qf;
}
