// Sparky, the Bahra Electric mascot, redrawn as layered SVG from the
// character sheet so every limb can be posed per frame.
// Local space is 400 x 720 with the feet centred on (200, 700).
(function () {
  const O = 'stroke="#263042" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"';
  const SKIN = '#F6C9A0', SKIN_SH = '#E2A57C', SHIRT = '#A9C5E6', SHIRT_SH = '#8EAED6',
    SHIRT_LT = '#BED5EF';

  // One arm hanging straight down from the shoulder pivot (140, 290).
  // The right arm reuses it inside a mirrored group, so positive shoulder
  // angles always swing an arm outward and up.
  const arm = (id) => `
  <g id="${id}">
    <path fill="${SHIRT}" ${O} d="M117,286 Q140,264 163,286 L166,350 L114,350 Z"/>
    <path fill="${SHIRT_SH}" opacity=".55" d="M117,300 L124,300 L123,346 L116,346 Z"/>
    <rect x="111" y="340" width="58" height="23" rx="10" fill="${SHIRT_SH}" ${O}/>
    <path d="M118,351 H162" stroke="#7896C2" stroke-width="2.5" fill="none"/>
    <path fill="${SKIN}" ${O} d="M121,362 L159,362 L157,396 L123,396 Z"/>
    <g id="${id}-fore">
      <path fill="${SKIN}" ${O} d="M122,390 Q140,383 158,390 Q157,426 153,454 L127,454 Q123,426 122,390 Z"/>
      <path fill="${SKIN_SH}" opacity=".6" d="M150,396 Q154,426 151,450 L146,450 Q148,426 146,398 Z"/>
      <g id="${id}-hand">
        <g class="hand-open">
          <ellipse cx="160" cy="468" rx="8" ry="14" transform="rotate(-28 160 468)" fill="${SKIN}" ${O}/>
          <path fill="${SKIN}" ${O} d="M123,452 Q118,474 124,490 Q131,500 140,500 Q149,500 156,490 Q162,474 157,452 Z"/>
          <path d="M132,484 L131,497 M140,486 L140,500 M148,484 L149,497" stroke="#C98E68" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        </g>
        <g class="hand-point" display="none">
          <rect x="133" y="474" width="14" height="44" rx="7" fill="${SKIN}" ${O}/>
          <circle cx="140" cy="470" r="18" fill="${SKIN}" ${O}/>
          <ellipse cx="156" cy="466" rx="7" ry="11" transform="rotate(-20 156 466)" fill="${SKIN}" ${O}/>
          <path d="M128,478 Q134,484 142,482" stroke="#C98E68" stroke-width="2.5" fill="none"/>
        </g>
        <g class="hand-thumb" display="none">
          <rect x="128" y="476" width="15" height="34" rx="7.5" fill="${SKIN}" ${O}/>
          <circle cx="142" cy="470" r="19" fill="${SKIN}" ${O}/>
          <path d="M148,458 Q156,466 148,476 M150,470 Q158,478 150,486" stroke="#C98E68" stroke-width="2.5" fill="none"/>
        </g>
      </g>
    </g>
  </g>`;

  const legs = `
  <g id="sp-legs">
    <path fill="#4C72A8" ${O} d="M135,416 L265,416 L267,632 L208,632 L202,478 L198,478 L192,632 L133,632 Z"/>
    <path fill="#3B5D8E" opacity=".75" d="M137,440 L149,440 L147,628 L136,628 Z M251,440 L263,440 L264,628 L253,628 Z"/>
    <path d="M200,420 V476 M152,548 Q166,556 182,548 M218,548 Q234,556 248,548" stroke="#3B5D8E" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="130" y="610" width="66" height="22" rx="7" fill="#5C84BC" ${O}/>
    <rect x="204" y="610" width="66" height="22" rx="7" fill="#5C84BC" ${O}/>
    <path fill="#6B5546" ${O} d="M140,628 L193,628 L195,664 Q197,684 183,688 L121,688 Q104,688 108,672 Q114,655 140,651 Z"/>
    <path fill="#6B5546" ${O} d="M260,628 L207,628 L205,664 Q203,684 217,688 L279,688 Q296,688 292,672 Q286,655 260,651 Z"/>
    <path fill="#3A2E26" ${O} d="M104,680 L197,680 L197,692 Q197,699 190,699 L111,699 Q104,699 104,692 Z"/>
    <path fill="#3A2E26" ${O} d="M296,680 L203,680 L203,692 Q203,699 210,699 L289,699 Q296,699 296,692 Z"/>
    <ellipse cx="126" cy="666" rx="11" ry="5" fill="#8C735F"/>
    <ellipse cx="274" cy="666" rx="11" ry="5" fill="#8C735F"/>
    <path d="M150,640 L182,640 M150,652 L182,652 M218,640 L250,640 M218,652 L250,652" stroke="#4A3A30" stroke-width="3" stroke-linecap="round"/>
  </g>`;

  const torso = `
  <g id="sp-torso">
    <path fill="${SKIN}" ${O} d="M181,226 L219,226 L217,276 L183,276 Z"/>
    <path fill="${SKIN_SH}" d="M183,244 Q200,258 217,244 L217,258 Q200,270 183,258 Z"/>
    <path fill="${SHIRT}" ${O} d="M150,266 Q200,254 250,266 L277,284 Q286,292 284,306 L271,422 L129,422 L116,306 Q114,292 123,284 Z"/>
    <path fill="${SHIRT_SH}" opacity=".7" d="M118,306 L131,420 L147,420 L137,300 Z M282,306 L269,420 L253,420 L263,300 Z"/>
    <path fill="#fff" ${O} d="M183,262 L200,292 L217,262 Z"/>
    <path fill="${SHIRT_LT}" ${O} d="M188,256 L154,269 L170,304 L199,281 Z"/>
    <path fill="${SHIRT_LT}" ${O} d="M212,256 L246,269 L230,304 L201,281 Z"/>
    <path d="M200,292 V408" stroke="#7896C2" stroke-width="3"/>
    <g fill="#F4F7FB" ${O} stroke-width="2.5">
      <circle cx="200" cy="318" r="4"/><circle cx="200" cy="348" r="4"/><circle cx="200" cy="378" r="4"/>
    </g>
    <rect x="145" y="318" width="44" height="46" rx="7" fill="${SHIRT}" stroke="#7896C2" stroke-width="3"/>
    <path fill="${SHIRT_LT}" stroke="#7896C2" stroke-width="3" stroke-linejoin="round" d="M143,312 L191,312 L190,327 L167,334 L144,327 Z"/>
    <rect x="211" y="318" width="44" height="46" rx="7" fill="${SHIRT}" stroke="#7896C2" stroke-width="3"/>
    <path fill="${SHIRT_LT}" stroke="#7896C2" stroke-width="3" stroke-linejoin="round" d="M209,312 L257,312 L256,327 L233,334 L210,327 Z"/>
    <use href="#emblem" x="217" y="334" width="32" height="32"/>
    <path fill="#9AA5B1" ${O} stroke-width="3" d="M121,424 L121,392 Q112,388 112,378 Q112,366 122,363 L122,374 L130,374 L130,363 Q140,366 140,378 Q140,388 131,392 L131,424 Z"/>
    <rect x="262" y="378" width="13" height="32" rx="5" fill="#2E6DB4" ${O} stroke-width="3"/>
    <rect x="266" y="406" width="5" height="18" fill="#9AA5B1"/>
    <path d="M281,424 L278,384 M290,424 L294,384" stroke="#E3262B" stroke-width="7" stroke-linecap="round"/>
    <rect x="126" y="404" width="148" height="27" rx="6" fill="#8A5A2E" ${O}/>
    <path d="M132,417 H182 M218,417 H268" stroke="#C08A52" stroke-width="2" stroke-dasharray="6 5"/>
    <rect x="185" y="399" width="30" height="36" rx="6" fill="#D8B35E" ${O}/>
    <rect x="193" y="408" width="14" height="18" rx="2" fill="#8A5A2E"/>
    <path fill="#D9A13E" ${O} d="M104,416 L153,416 L151,486 Q129,497 107,486 Z"/>
    <path fill="#C48A2C" ${O} d="M104,416 L153,416 L152,438 L105,438 Z"/>
    <circle cx="128" cy="452" r="3.5" fill="#8A5A2E"/>
    <path fill="#D9A13E" ${O} d="M247,416 L296,416 L293,486 Q271,497 249,486 Z"/>
    <path fill="#C48A2C" ${O} d="M247,416 L296,416 L295,438 L248,438 Z"/>
    <circle cx="272" cy="452" r="3.5" fill="#8A5A2E"/>
  </g>`;

  const head = `
  <g id="sp-head">
    <ellipse cx="124" cy="204" rx="15" ry="22" fill="${SKIN}" ${O}/>
    <ellipse cx="276" cy="204" rx="15" ry="22" fill="${SKIN}" ${O}/>
    <path d="M122,196 Q116,206 124,216 M278,196 Q284,206 276,216" stroke="${SKIN_SH}" stroke-width="4" fill="none"/>
    <path fill="${SKIN}" ${O} d="M126,150 Q121,232 160,263 Q200,290 240,263 Q279,232 274,150 Z"/>
    <path fill="#6B4226" ${O} stroke-width="3" d="M126,150 L158,150 Q151,178 147,200 Q134,198 129,184 Z"/>
    <path fill="#6B4226" ${O} stroke-width="3" d="M274,150 L242,150 Q249,178 253,200 Q266,198 271,184 Z"/>
    <path d="M146,167 Q163,154 182,164 M218,164 Q237,154 254,167" stroke="#4E2F1A" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g id="sp-eyes">
      <ellipse cx="165" cy="193" rx="17" ry="19" fill="#fff" ${O} stroke-width="3"/>
      <ellipse cx="235" cy="193" rx="17" ry="19" fill="#fff" ${O} stroke-width="3"/>
      <g id="sp-pupils">
        <circle cx="167" cy="195" r="11" fill="#4A2C17"/><circle cx="233" cy="195" r="11" fill="#4A2C17"/>
        <circle cx="167" cy="195" r="6" fill="#111"/><circle cx="233" cy="195" r="6" fill="#111"/>
        <circle cx="163" cy="190" r="4" fill="#fff"/><circle cx="229" cy="190" r="4" fill="#fff"/>
        <circle cx="171" cy="200" r="2" fill="#fff"/><circle cx="237" cy="200" r="2" fill="#fff"/>
      </g>
    </g>
    <path d="M197,204 Q190,220 199,224 Q207,226 209,218" stroke="#C98258" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="145" cy="226" rx="13" ry="8" fill="#F39A84" opacity=".45"/>
    <ellipse cx="255" cy="226" rx="13" ry="8" fill="#F39A84" opacity=".45"/>
    <path fill="#8E2A2A" ${O} d="M164,232 Q200,280 236,232 Q200,243 164,232 Z"/>
    <path fill="#fff" d="M169,235 Q200,245 231,235 L228,243 Q200,252 172,243 Z"/>
    <path fill="#E26D6D" d="M184,258 Q200,248 216,258 Q200,266 184,258 Z"/>
    <path fill="#2E6DB4" ${O} d="M115,156 C113,84 160,60 200,60 C240,60 287,84 285,156 Z"/>
    <path fill="#4383CB" ${O} stroke-width="3" d="M185,63 Q200,57 215,63 L219,154 L181,154 Z"/>
    <path fill="#6AA2DF" opacity=".85" d="M134,130 C138,98 154,82 174,74 C160,92 151,110 149,134 Z"/>
    <use href="#emblem" x="225" y="94" width="44" height="44"/>
    <path fill="#2A63A6" ${O} d="M90,158 Q200,132 310,158 Q316,173 299,177 Q200,159 101,177 Q84,173 90,158 Z"/>
  </g>`;

  window.SPARKY_SVG = `
  <g id="sp-root">
    <ellipse id="sp-shadow" cx="200" cy="700" rx="125" ry="17" fill="#0D2340" opacity=".2"/>
    <g id="sp-body">
      ${legs}
      ${arm('sp-armL')}
      <g transform="translate(400,0) scale(-1,1)">${arm('sp-armR')}</g>
      ${torso}
      ${head}
    </g>
  </g>`;
})();
