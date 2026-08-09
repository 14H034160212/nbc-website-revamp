/* ===========================================================================
   Find a passage — two ways in, one guarantee.

   1. A CURATED TOPICAL INDEX. Pick a real-life question ("I am anxious",
      "someone has died") and it pulls a hand-picked list of references — the
      same list a printed topical index would give you. Nothing about it is
      generated, so nothing can be invented.

   2. A FREE-TEXT QUESTION BOX, answered by an AI assistant via /api/ask. The
      model does exactly one job: read what the person wrote and choose which
      passages speak to it, plus a short framing in their language.

   THE GUARANTEE THAT SPANS BOTH
      The model never writes scripture. Every verse on this page — curated or
      AI-chosen — is fetched from api.getbible.net by the code below. Language
      models paraphrase scripture confidently and wrongly, so that job is taken
      away from the model entirely. See functions/api/_ask-core.mjs.

   Passage text comes from api.getbible.net (free, no key, CORS-open,
   public-domain translations). Verse ranges are sliced client-side because
   the API serves whole chapters.
   ========================================================================= */
(function () {
  'use strict';

  var root = document.getElementById('nbc-ask');
  if (!root) return;

  var API = 'https://api.getbible.net/v2/';
  var DATA = {"chapters":[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22],"names":{"kjv":["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"],"cus":["创世记","出埃及记","利未记","民数记","申命记","约书亚记","士师记","路得记","撒母耳记上","撒母耳记下","列王纪上","列王纪下","历代志上","历代志下","以斯拉记","尼希米记","以斯帖记","约伯记","诗篇","箴言","传道书","雅歌","以赛亚书","耶利米书","耶利米哀歌","以西结书","但以理书","何西阿书","约珥书","阿摩司书","俄巴底亚书","约拿书","弥迦书","那鸿书","哈巴谷书","西番雅书","哈该书","撒迦利亚书","玛拉基书","马太福音","马可福音","路加福音","约翰福音","使徒行传","罗马书","哥林多前书","哥林多后书","加拉太书","以弗所书","腓立比书","歌罗西书","帖撒罗尼迦前书","帖撒罗尼迦后书","提摩太前书","提摩太后书","提多书","腓利门书","希伯来书","雅各书","彼得前书","彼得后书","约翰一书","约翰二书","约翰三书","犹大书","启示录"],"cut":["創世記","出埃及記","利未記","民數記","申命記","約書亞記","士師記","路得記","撒母耳記上","撒母耳記下","列王紀上","列王紀下","歷代志上","歷代志下","以斯拉記","尼希米記","以斯帖記","約伯記","詩篇","箴言","傳道書","雅歌","以賽亞書","耶利米書","耶利米哀歌","以西結書","但以理書","何西阿書","約珥書","阿摩司書","俄巴底亞書","約拿書","彌迦書","那鴻書","哈巴谷書","西番雅書","哈該書","撒迦利亞書","瑪拉基書","馬太福音","馬可福音","路加福音","約翰福音","使徒行傳","羅馬書","哥林多前書","哥林多後書","加拉太書","以弗所書","腓立比書","歌羅西書","帖撒羅尼迦前書","帖撒羅尼迦後書","提摩太前書","提摩太後書","提多書","腓利門書","希伯來書","雅各書","彼得前書","彼得後書","約翰一書","約翰二書","約翰三書","猶大書","啟示錄"],"korean":["창세기","출애굽기","레위기","민수기","신명기","여호수아","사사기","룻기","사무엘상","사무엘하","열왕기상","열왕기하","역대상","역대하","에스라","느헤미야","에스더","욥기","시편","잠언","전도서","아가","이사야","예레미야","예레미야 애가","에스겔","다니엘","호세아","요엘","아모스","오바댜","요나","미가","나훔","하박국","스바냐","학개","스가랴","말라기","마태복음","마가복음","누가복음","요한복음","사도행전","로마서","고린도전서","고린도후서","갈라디아서","에베소서","빌립보서","골로새서","데살로니가전서","데살로니가후서","디모데전서","디모데후서","디도서","빌레몬서","히브리서","야고보서","베드로전서","베드로후서","요한일서","요한이서","요한삼서","유다서","요한계시록"],"maori":["Genesis","Ekoru","Rewitika","Tauanga","Ture","Hohua","Kaiwhakawa","Ruti","1 Hāmueru","2 Hāmueru","1 Kingi","2 Kingi","1 Koriniti","2 Koriniti","Ezara","Nehemiha","Ehetere","Iopa","Himene","Whakataukī","Kaiwhakaako","Waiata","Ihaia","Heremaia","Kanohi Tangi","Ehikiera","Danihēra","Hōhea","Iōēri","Amōhi","Opātia","Iōna","Mīkaia","Nahumu","Hapakuku","Horopīa","Hakai","Hakaharīa","Merakai","Matēu","Māka","Ruka","Hōani","Ngā Mahi","Rōmana","1 Koriniti","2 Koriniti","Karaiti","Epeha","Whiringa-ā-nuku","Karōhia","1 Teratera","2 Teratera","1 Timotī","2 Timotī","Tītahi","Phīremōna","Hīperu","Hāme","1 Pētera","2 Pētera","1 Hōani","2 Hōani","3 Hōani","Hura","Whakakitenga"],"tagalog":["Genesis","Exodo","Levitico","Mga Bilang","Deuteronomio","Josue","Mga Hukom","Ruth","1 Samuel","2 Samuel","1 Mga Hari","2 Mga Hari","1 Mga Cronica","2 Mga Cronica","Ezra","Nehemias","Ester","Job","Mga Awit","Mga Kawikaan","Mangangaral","Awit ni Solomon","Isaias","Jeremias","Mga Panaghoy","Ezekiel","Daniel","Oseas","Joel","Amos","Obadias","Jonas","Mikas","Nahum","Habacuc","Zefanias","Hagai","Zacarias","Malachias","Mateo","Marcos","Lucas","Juan","Mga Gawa","Mga Romano","1 Mga Corinto","2 Mga Corinto","Mga Taga-Galacia","Mga Efeso","Mga Taga-Filipos","Mga Taga-Colosas","1 Mga Taga-Tesalonica","2 Mga Taga-Tesalonica","1 Timoteo","2 Timoteo","Tito","Filemon","Mga Hebreo","Santiago","1 Pedro","2 Pedro","1 Juan","2 Juan","3 Juan","Judas","Pahayag"]}};

  /* Which translation to show for each interface language, and which
     English edition to put beside it. WEB is used rather than KJV because
     the people most likely to need the parallel column are the ones for
     whom 17th-century English is an extra obstacle. */
  var PRIMARY = { 'en': 'web', 'zh-Hans': 'cus', 'ko': 'korean', 'mi': 'maori' };
  var BOOKSET = { 'web': 'kjv', 'cus': 'cus', 'korean': 'korean', 'maori': 'maori' };
  var ENGLISH = 'web';

  /* ---- interface strings ------------------------------------------------ */
  var UI = {
    'en': {
      h1: 'Find a Passage',
      aiLabel: 'Or describe what is going on, in your own words.',
      aiPlaceholder: 'e.g. I have to make a hard decision and I do not know how to pray about it',
      aiGo: 'Ask',
      aiNote: 'Answers are written by an AI assistant and point you to passages; the passages themselves come from a real translation. It is not pastoral advice.',
      aiThinking: 'Looking…',
      aiFailed: 'Something went wrong. Please try again, or pick a question above.',
      aiBusy: 'A lot of people are asking right now. Please try again shortly.',
      aiLimited: 'You have asked a few questions in a short time. Please try again later.',
      aiOff: 'The question box is not switched on for this deployment. The curated questions below work without it.',
      aiHuman: 'Some things are better talked through with a person. You can reach the church office on <a href="tel:+6494807064">(09) 480 7064</a> or <a href="mailto:office@nbc.org.nz">office@nbc.org.nz</a> any weekday.',
      lead: 'Pick what is going on. We will show you where the Bible speaks to it.',
      ph: 'Or type a reference — John 3:16',
      go: 'Go',
      whole: 'Read the whole chapter',
      loading: 'Loading…',
      failed: 'Could not load that passage. Please try again.',
      notfound: 'We could not read that reference. Try something like “John 3:16”.',
      parallel: 'English',
      pastoral: 'These passages are a starting point, not a diagnosis. If you are going through something hard, please talk to someone — you can reach the church office any weekday.'
    },
    'zh-Hans': {
      h1: '按主题查经',
      aiLabel: '或者用你自己的话，说说此刻的处境。',
      aiPlaceholder: '例如：我要做一个很难的决定，不知道该怎么祷告',
      aiGo: '提问',
      aiNote: '回应由 AI 助手撰写，只负责指出相关经文；经文原文来自真实译本。这不是牧养辅导。',
      aiThinking: '正在查找…',
      aiFailed: '出了点问题，请重试，或从上面的问题里选一个。',
      aiBusy: '现在提问的人有点多，请稍后再试。',
      aiLimited: '你在短时间内问了几次，请稍后再试。',
      aiOff: '这个部署没有开启提问框。下面的常见处境查经不需要它也能用。',
      aiHuman: '有些事更适合和人聊聊。平日都可以联系教会办公室：<a href="tel:+6494807064">(09) 480 7064</a> 或 <a href="mailto:office@nbc.org.nz">office@nbc.org.nz</a>。',
      lead: '选一个此刻的处境，我们把圣经里相关的经文找出来给你。',
      ph: '或直接输入经文地址 —— 约翰福音 3:16',
      go: '查找',
      whole: '读整章',
      loading: '加载中…',
      failed: '这段经文加载失败，请重试。',
      notfound: '没有读懂这个经文地址，试试「约翰福音 3:16」这样的写法。',
      parallel: '英文',
      pastoral: '这些经文是一个起点，不是答案的全部。如果你正经历难处，请找人聊聊 —— 平日都可以联系教会办公室。'
    },
    'ko': {
      h1: '주제별 말씀 찾기',
      aiLabel: '또는 지금의 상황을 직접 적어 주셔도 됩니다.',
      aiPlaceholder: '예: 어려운 결정을 앞두고 있는데 어떻게 기도해야 할지 모르겠습니다',
      aiGo: '질문하기',
      aiNote: '답변은 AI 도우미가 작성하며 관련 본문을 안내할 뿐입니다. 본문 자체는 실제 역본에서 가져옵니다. 목회 상담이 아닙니다.',
      aiThinking: '찾는 중…',
      aiFailed: '문제가 발생했습니다. 다시 시도하시거나 위의 질문 중에서 골라 주십시오.',
      aiBusy: '지금 이용자가 많습니다. 잠시 후 다시 시도해 주십시오.',
      aiLimited: '짧은 시간에 여러 번 질문하셨습니다. 잠시 후 다시 시도해 주십시오.',
      aiOff: '이 배포에서는 질문 상자가 켜져 있지 않습니다. 아래 주제별 찾기는 그대로 사용하실 수 있습니다.',
      aiHuman: '어떤 이야기는 사람과 나누는 편이 좋습니다. 평일에 교회 사무실로 연락하실 수 있습니다: <a href="tel:+6494807064">(09) 480 7064</a>, <a href="mailto:office@nbc.org.nz">office@nbc.org.nz</a>.',
      lead: '지금의 상황을 골라 주십시오. 성경이 무엇이라 말하는지 찾아 드립니다.',
      ph: '또는 성경 구절 입력 — 요한복음 3:16',
      go: '찾기',
      whole: '장 전체 읽기',
      loading: '불러오는 중…',
      failed: '본문을 불러오지 못했습니다. 다시 시도해 주십시오.',
      notfound: '구절을 읽지 못했습니다. “요한복음 3:16” 형식으로 입력해 보십시오.',
      parallel: '영어',
      pastoral: '이 말씀들은 시작점이며 전부는 아닙니다. 어려운 일을 지나고 계시다면 누군가와 이야기해 주십시오. 평일에 교회 사무실로 연락하실 수 있습니다.'
    },
    'mi': {
      h1: 'Rapua he kupu',
      aiLabel: 'Or describe what is going on, in your own words.',
      aiPlaceholder: 'e.g. I have to make a hard decision and I do not know how to pray about it',
      aiGo: 'Pātai',
      aiNote: 'Answers are written by an AI assistant and point you to passages; the passages themselves come from a real translation. It is not pastoral advice.',
      aiThinking: 'Looking…',
      aiFailed: 'Something went wrong. Please try again, or pick a question above.',
      aiBusy: 'A lot of people are asking right now. Please try again shortly.',
      aiLimited: 'You have asked a few questions in a short time. Please try again later.',
      aiOff: 'The question box is not switched on for this deployment. The curated questions below work without it.',
      aiHuman: 'Some things are better talked through with a person. You can reach the church office on <a href="tel:+6494807064">(09) 480 7064</a> or <a href="mailto:office@nbc.org.nz">office@nbc.org.nz</a> any weekday.',
      lead: 'Pick what is going on. We will show you where the Bible speaks to it.',
      ph: 'Or type a reference — Hoani 3:16',
      go: 'Rapua',
      whole: 'Pānuitia te upoko katoa',
      loading: 'Loading…',
      failed: 'Could not load that passage. Please try again.',
      notfound: 'We could not read that reference. Try something like “Hoani 3:16”.',
      parallel: 'English',
      pastoral: 'These passages are a starting point, not a diagnosis. If you are going through something hard, please talk to someone — you can reach the church office any weekday.'
    }
  };

  /* ---- the curated index ------------------------------------------------
     [book number 1-66, chapter, first verse, last verse]                    */
  var TOPICS = [
    { id: 'anxiety',
      label: { 'en': 'I feel anxious', 'zh-Hans': '我很焦虑', 'ko': '불안합니다' },
      refs: [[50,4,6,7],[40,6,25,27],[60,5,6,7],[19,55,22,22]] },

    { id: 'fear',
      label: { 'en': 'I am afraid', 'zh-Hans': '我害怕', 'ko': '두렵습니다' },
      refs: [[23,41,10,10],[6,1,9,9],[19,23,4,4],[55,1,7,7]] },

    { id: 'lonely',
      label: { 'en': 'I feel alone', 'zh-Hans': '我很孤单', 'ko': '외롭습니다' },
      refs: [[5,31,6,6],[19,139,7,10],[58,13,5,5],[40,28,20,20]] },

    { id: 'grief',
      label: { 'en': 'Someone I love has died', 'zh-Hans': '我失去了亲人', 'ko': '사랑하는 사람을 잃었습니다' },
      refs: [[19,34,18,18],[43,11,25,26],[66,21,4,4],[40,5,4,4]] },

    { id: 'forgive',
      label: { 'en': 'I need to forgive, or be forgiven', 'zh-Hans': '关于饶恕', 'ko': '용서에 대하여' },
      refs: [[62,1,9,9],[51,3,13,13],[40,6,14,15],[49,4,32,32]] },

    { id: 'guidance',
      label: { 'en': 'I have a hard decision to make', 'zh-Hans': '我面临一个难的抉择', 'ko': '어려운 결정을 앞두고 있습니다' },
      refs: [[20,3,5,6],[19,119,105,105],[59,1,5,5],[19,32,8,8]] },

    { id: 'suffering',
      label: { 'en': 'Why is this happening to me?', 'zh-Hans': '为什么是我遇到这些？', 'ko': '왜 이런 일이 생길까요?' },
      refs: [[45,8,28,28],[47,12,9,9],[19,46,1,3],[45,5,3,5]] },

    { id: 'hope',
      label: { 'en': 'I need hope', 'zh-Hans': '我需要盼望', 'ko': '소망이 필요합니다' },
      refs: [[24,29,11,11],[25,3,22,23],[45,15,13,13],[60,1,3,3]] },

    { id: 'money',
      label: { 'en': 'Money and debt worry me', 'zh-Hans': '金钱与债务的压力', 'ko': '재정과 빚이 걱정됩니다' },
      refs: [[40,6,19,21],[54,6,6,8],[20,22,7,7],[47,9,6,7]] },

    { id: 'family',
      label: { 'en': 'My family is struggling', 'zh-Hans': '家庭里的难处', 'ko': '가정이 힘듭니다' },
      refs: [[49,6,1,4],[51,3,12,14],[20,22,6,6],[6,24,15,15]] },

    { id: 'jesus',
      label: { 'en': 'Who is Jesus, and why does it matter?', 'zh-Hans': '耶稣是谁？为什么重要？', 'ko': '예수님은 누구십니까?' },
      refs: [[43,3,16,16],[45,10,9,9],[49,2,8,9],[43,14,6,6]] },

    { id: 'prayer',
      label: { 'en': 'How do I pray?', 'zh-Hans': '我该怎么祷告？', 'ko': '어떻게 기도합니까?' },
      refs: [[40,6,9,13],[50,4,6,6],[62,5,14,15],[42,11,9,10]] },

    { id: 'thanks',
      label: { 'en': 'Something good happened', 'zh-Hans': '我想献上感恩', 'ko': '감사를 드리고 싶습니다' },
      refs: [[52,5,16,18],[19,100,4,5],[51,3,15,17]] }
  ];

  /* ---- elements --------------------------------------------------------- */
  var elLead  = root.querySelector('[data-ask-lead]');
  var elChips = root.querySelector('[data-ask-topics]');
  var elForm  = root.querySelector('[data-ask-form]');
  var elInput = root.querySelector('[data-ask-input]');
  var elGo    = root.querySelector('[data-ask-go]');
  var elOut   = root.querySelector('[data-ask-out]');
  var elFoot  = root.querySelector('[data-ask-pastoral]');

  var lang = 'en';
  var cache = {};

  function t(k) { return (UI[lang] || UI.en)[k] || UI.en[k]; }
  function label(topic) { return topic.label[lang] || topic.label.en; }
  function books() { return DATA.names[BOOKSET[PRIMARY[lang]] || 'kjv'] || DATA.names.kjv; }

  /* ---- fetching --------------------------------------------------------- */
  function chapter(trans, book, chap) {
    var key = trans + '/' + book + '/' + chap;
    if (cache[key]) return Promise.resolve(cache[key]);
    return fetch(API + trans + '/' + book + '/' + chap + '.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { cache[key] = j; return j; });
  }

  function slice(json, from, to) {
    return json.verses.filter(function (v) { return v.verse >= from && v.verse <= to; });
  }

  /* ---- rendering -------------------------------------------------------- */
  function verseList(verses, dir) {
    var d = document.createElement('div');
    d.className = 'ask-verses';
    if (dir === 'RTL') d.dir = 'rtl';
    verses.forEach(function (v) {
      var p = document.createElement('p');
      p.className = 'ask-verse';
      var n = document.createElement('span');
      n.className = 'ask-verse__n';
      n.textContent = v.verse;
      p.appendChild(n);
      p.appendChild(document.createTextNode(v.text.trim()));
      d.appendChild(p);
    });
    return d;
  }

  function card(ref) {
    var book = ref[0], chap = ref[1], from = ref[2], to = ref[3];
    var primary = PRIMARY[lang] || 'web';
    var wantParallel = primary !== ENGLISH;

    var art = document.createElement('article');
    art.className = 'ask-card';
    art.innerHTML = '<p class="ask-card__loading">' + t('loading') + '</p>';

    var jobs = [chapter(primary, book, chap)];
    if (wantParallel) jobs.push(chapter(ENGLISH, book, chap));

    Promise.all(jobs).then(function (res) {
      var main = res[0];
      // Use our own book-name table rather than main.book_name: getBible's
      // simplified Chinese edition labels one book in traditional characters,
      // which looks like a typo next to twelve simplified ones.
      var name = books()[book - 1] || (main.book_name || '').replace(/^﻿/, '');
      var refLabel = name + ' ' + chap + ':' + (from === to ? from : from + '–' + to);

      art.innerHTML = '';

      var h = document.createElement('h3');
      h.className = 'ask-card__ref';
      h.textContent = refLabel;
      art.appendChild(h);

      var cols = document.createElement('div');
      cols.className = 'ask-card__cols' + (wantParallel ? ' is-parallel' : '');

      var colA = document.createElement('div');
      colA.className = 'ask-col';
      var edA = document.createElement('p');
      edA.className = 'ask-col__ed';
      edA.textContent = main.translation;
      colA.appendChild(edA);
      colA.appendChild(verseList(slice(main, from, to), main.direction));
      cols.appendChild(colA);

      if (wantParallel) {
        var eng = res[1];
        var colB = document.createElement('div');
        colB.className = 'ask-col';
        var edB = document.createElement('p');
        edB.className = 'ask-col__ed';
        edB.textContent = t('parallel') + ' · ' + eng.translation;
        colB.appendChild(edB);
        colB.appendChild(verseList(slice(eng, from, to), eng.direction));
        cols.appendChild(colB);
      }

      art.appendChild(cols);

      var more = document.createElement('a');
      more.className = 'ask-card__more';
      more.href = 'bible.html?ref=' + book + '.' + chap;
      more.textContent = t('whole') + ' →';
      art.appendChild(more);

    }).catch(function () {
      art.innerHTML = '<p class="ask-card__error">' + t('failed') + '</p>';
    });

    return art;
  }

  function show(refs, heading, scroll) {
    elOut.innerHTML = '';
    if (heading) {
      var h = document.createElement('h2');
      h.className = 'ask-out__head';
      h.textContent = heading;
      elOut.appendChild(h);
    }
    refs.forEach(function (r) { elOut.appendChild(card(r)); });
    elOut.hidden = false;
    elFoot.hidden = false;
    // Scroll only when the reader picked something. On a ?topic= deep link the
    // page would otherwise open already scrolled past the question list, so
    // the reader never sees that there are other questions.
    if (scroll) elOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- reference parsing ------------------------------------------------
     Accepts "John 3:16", "1 John 5:14-15", "约翰福音 3:16", "요한복음 3:16",
     with or without spaces, and matches against every book-name list we
     carry so a reader can type in their own language.                       */
  function parseRef(raw) {
    var s = String(raw).trim();
    if (!s) return null;

    var m = s.match(/^(.*?)[\s.]*(\d+)\s*[:：.\s]\s*(\d+)(?:\s*[-–~]\s*(\d+))?$/);
    if (!m) {
      m = s.match(/^(.*?)[\s.]*(\d+)$/);           // whole chapter
      if (!m) return null;
      m = [m[0], m[1], m[2], '1', '999'];
    }

    var name = m[1].replace(/\s+/g, '').toLowerCase();
    if (!name) return null;

    var lists = DATA.names;
    for (var set in lists) {
      var arr = lists[set];
      for (var i = 0; i < arr.length; i++) {
        var candidate = arr[i].replace(/^﻿/, '').replace(/\s+/g, '').toLowerCase();
        // Exact, or the typed text is a leading abbreviation of the book name
        // ("phil" -> Philippians). Require 3 characters for Latin scripts so
        // "j" does not silently pick John over James.
        var ok = candidate === name ||
                 (candidate.indexOf(name) === 0 && (name.length >= 3 || !/^[a-z0-9]+$/.test(name)));
        if (ok) {
          var chap = Math.max(1, parseInt(m[2], 10));
          var total = DATA.chapters[i];
          if (chap > total) chap = total;
          var from = Math.max(1, parseInt(m[3], 10));
          var to = m[4] ? parseInt(m[4], 10) : from;
          if (to < from) to = from;
          return [i + 1, chap, from, to];
        }
      }
    }
    return null;
  }

  /* ---- painting the controls -------------------------------------------- */
  function paint() {
    elLead.textContent = t('lead');
    elInput.placeholder = t('ph');
    elInput.setAttribute('aria-label', t('ph'));
    elGo.textContent = t('go');
    elFoot.textContent = t('pastoral');

    elChips.innerHTML = '';
    TOPICS.forEach(function (topic) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ask-chip';
      b.dataset.topic = topic.id;
      b.textContent = label(topic);
      b.addEventListener('click', function () { select(topic, b, true); });
      elChips.appendChild(b);
    });
  }

  function select(topic, btn, scroll) {
    elChips.querySelectorAll('.ask-chip').forEach(function (n) { n.classList.remove('is-on'); });
    if (btn) btn.classList.add('is-on');
    show(topic.refs, label(topic), scroll);
  }

  /* Deep link: ask.html?topic=grief — so a sermon page, a notice sheet or a
     pastoral email can point straight at the right set of passages. */
  function openFromUrl() {
    var want = new URLSearchParams(location.search).get('topic');
    if (!want) return false;
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].id === want) {
        select(TOPICS[i], elChips.querySelector('[data-topic="' + want + '"]'));
        return true;
      }
    }
    return false;
  }

  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var ref = parseRef(elInput.value);
    if (!ref) {
      elOut.innerHTML = '<p class="ask-card__error">' + t('notfound') + '</p>';
      elOut.hidden = false;
      return;
    }
    elChips.querySelectorAll('.ask-chip').forEach(function (n) { n.classList.remove('is-on'); });
    show([ref], null, true);
  });

  /* ---- AI question box -------------------------------------------------
     The model chooses references and writes the framing; the verse text is
     fetched from getBible by the same code the curated finder uses. A model
     never supplies scripture here — see functions/api/_ask-core.mjs. */
  var elAiForm  = root.querySelector('[data-ai-form]');
  var elAiLabel = root.querySelector('[data-ai-label]');
  var elAiInput = root.querySelector('[data-ai-input]');
  var elAiGo    = root.querySelector('[data-ai-go]');
  var elAiNote  = root.querySelector('[data-ai-note]');
  var elAiOff   = root.querySelector('[data-ai-off]');
  var elAiOut   = root.querySelector('[data-ai-out]');
  var aiEnabled = false;

  function paintAi() {
    // The page shell renders one h1 for all languages; keep it in step with
    // the selector so a Chinese reader is not met by an English heading.
    var h1 = document.querySelector('.cmsmasters_heading');
    if (h1) h1.textContent = t('h1');

    elAiLabel.textContent = t('aiLabel');
    elAiInput.placeholder = t('aiPlaceholder');
    elAiInput.setAttribute('aria-label', t('aiLabel'));
    elAiGo.textContent = t('aiGo');
    elAiNote.textContent = t('aiNote');
    if (!aiEnabled) elAiOff.textContent = t('aiOff');
  }

  // Ask the endpoint whether a key is configured. No key -> the box stays
  // hidden and the curated finder below is the whole feature.
  fetch('/api/ask', { method: 'GET' })
    .then(function (r) { return r.ok ? r.json() : { enabled: false }; })
    .catch(function () { return { enabled: false }; })
    .then(function (info) {
      aiEnabled = Boolean(info && info.enabled);
      elAiForm.hidden = !aiEnabled;
      elAiOff.hidden = aiEnabled;
      paintAi();
      aiFromUrl();
    });

  function aiError(key) {
    elAiOut.innerHTML = '<p class="ai-error">' + t(key) + '</p>';
    elAiOut.hidden = false;
  }

  function renderAi(data) {
    elAiOut.innerHTML = '';

    var framing = document.createElement('p');
    framing.className = 'ai-framing';
    framing.textContent = data.framing;
    elAiOut.appendChild(framing);

    data.references.forEach(function (r) {
      var card = card_for(r);
      elAiOut.appendChild(card);
    });

    if (data.talk_to_someone) {
      var human = document.createElement('div');
      human.className = 'ai-human';
      human.innerHTML = t('aiHuman');
      elAiOut.appendChild(human);
    }
    elAiOut.hidden = false;
  }

  // Reuse the passage card, adding the model's one-line reason above it.
  function card_for(r) {
    var wrap = document.createElement('div');
    if (r.why) {
      var why = document.createElement('p');
      why.className = 'ai-why';
      why.textContent = r.why;
      wrap.appendChild(why);
    }
    wrap.appendChild(card([r.book, r.chapter, r.from, r.to]));
    return wrap;
  }

  /* Deep link: ask/?q=... prefills and submits, so a question can be shared
     or linked from a notice sheet the same way ?topic= can. */
  function aiFromUrl() {
    var q = new URLSearchParams(location.search).get('q');
    if (!q || !aiEnabled) return;
    elAiInput.value = q;
    elAiForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  elAiForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var question = elAiInput.value.trim();
    if (question.length < 4) return;

    elAiGo.disabled = true;
    elAiOut.hidden = false;
    elAiOut.innerHTML = '<p class="ask-card__loading">' + t('aiThinking') + '</p>';

    fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: question, lang: lang })
    }).then(function (r) {
      return r.json().then(function (body) { return { status: r.status, body: body }; });
    }).then(function (res) {
      if (res.status === 429) return aiError(String(res.body.error).indexOf('day') > -1 ? 'aiBusy' : 'aiLimited');
      if (res.status === 503) return aiError('aiBusy');
      if (res.body && res.body.error) return aiError('aiFailed');
      renderAi(res.body);
    }).catch(function () {
      aiError('aiFailed');
    }).then(function () {
      elAiGo.disabled = false;
    });
  });

  /* ---- language: self-contained, no dependency on the rest of the page ---
     The prototype's header switcher navigates between the /zh/, /ko/ and /mi/
     landing pages, the way Polylang would on the real site. This page is
     genuinely multilingual in itself, so it carries its own control. */
  var LANGS = [
    ['en', 'English'],
    ['zh-Hans', '中文'],
    ['ko', '한국어'],
    ['mi', 'Te Reo Māori']
  ];
  var LS = 'nbc-ask-lang';
  var elLang = root.querySelector('[data-ask-lang]');

  function initialLang() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && UI[q]) return q;
    try {
      var v = localStorage.getItem(LS);
      if (v && UI[v]) return v;
    } catch (e) {}
    var nav = (navigator.language || 'en').toLowerCase();
    if (nav.indexOf('zh') === 0) return 'zh-Hans';
    if (nav.indexOf('ko') === 0) return 'ko';
    if (nav.indexOf('mi') === 0) return 'mi';
    return 'en';
  }

  function setLang(next, keepTopic) {
    lang = next;
    cache = {};
    document.documentElement.setAttribute('lang', lang === 'zh-Hans' ? 'zh-Hans' : lang);
    try { localStorage.setItem(LS, lang); } catch (e) {}

    paint();
    paintAi();
    elOut.hidden = true;
    elOut.innerHTML = '';
    elFoot.hidden = true;

    // Switching language mid-read re-shows the same passages in the new
    // language rather than dumping the reader back to an empty page.
    if (keepTopic) {
      for (var i = 0; i < TOPICS.length; i++) {
        if (TOPICS[i].id === keepTopic) {
          select(TOPICS[i], elChips.querySelector('[data-topic="' + keepTopic + '"]'), false);
          return;
        }
      }
    }
  }

  LANGS.forEach(function (pair) {
    var o = document.createElement('option');
    o.value = pair[0];
    o.textContent = pair[1];
    o.lang = pair[0];
    elLang.appendChild(o);
  });

  elLang.addEventListener('change', function () {
    var on = elChips.querySelector('.ask-chip.is-on');
    setLang(this.value, on ? on.dataset.topic : null);
  });

  lang = initialLang();
  elLang.value = lang;
  setLang(lang, null);
  openFromUrl();
})();
