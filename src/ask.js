/* ===========================================================================
   Find a passage — topical scripture finder, multilingual.

   WHAT THIS IS
     A curated topical index. Pick a real-life question ("I am anxious",
     "someone has died") and it pulls the passages a pastor would point you
     to, in your language and in English side by side.

   WHAT THIS IS NOT
     It is not an AI answering questions about the Bible, and it does not
     pretend to be. Every question maps to a hand-picked list of references —
     the same list a printed topical index would give you. Nothing is
     generated, so nothing can be invented. For a church, that matters:
     a confident wrong answer about scripture is worse than no answer.

   Passage text comes from api.getbible.net (free, no key, CORS-open,
   public-domain translations). Verse ranges are sliced client-side because
   the API serves whole chapters.
   ========================================================================= */
(function () {
  'use strict';

  var root = document.getElementById('nbc-ask');
  if (!root) return;

  var API = 'https://api.getbible.net/v2/';
  var DATA = /*__BOOKDATA__*/;

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

  var first = true;
  window.NBC.onLang(function (l) {
    var previous = elChips.querySelector('.ask-chip.is-on');
    var keep = previous ? previous.dataset.topic : null;

    lang = l;
    cache = {};
    paint();
    elOut.hidden = true;
    elOut.innerHTML = '';
    elFoot.hidden = true;

    if (first && openFromUrl()) { first = false; return; }
    first = false;

    // Switching language mid-read should re-show the same passages in the new
    // language rather than dumping the reader back to an empty page.
    if (keep) {
      for (var i = 0; i < TOPICS.length; i++) {
        if (TOPICS[i].id === keep) {
          select(TOPICS[i], elChips.querySelector('[data-topic="' + keep + '"]'));
          break;
        }
      }
    }
  });
})();
