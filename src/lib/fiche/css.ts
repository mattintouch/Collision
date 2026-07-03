// S10 — feuille de style de la fiche de prep, extraite verbatim du gabarit de
// référence (docs/gabarits/fiche-gdiy-onesta_1.html). Tokens et classes FIXES.
// Ne pas réinterpréter les couleurs ni les tailles : c'est l'identité Onesta.

export const FICHE_CSS = `
  :root{
    --paper:#F4F5F1;
    --paper-deep:#E7E9E3;
    --ink:#1B1D1E;
    --ink-soft:#4A4D49;
    --cobalt:#1B3FBF;
    --cobalt-deep:#142E8C;
    --amber:#B5790A;
    --amber-band:#F6E8C8;
    --line:#CFD2CA;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{
    background:var(--paper-deep);
    color:var(--ink);
    font-family:var(--sans);
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  .sheet{
    max-width:780px;
    margin:0 auto;
    background:var(--paper);
    border-left:1px solid var(--line);
    border-right:1px solid var(--line);
    padding:0 22px 64px;
  }
  header.brief{ padding:30px 0 18px; border-bottom:3px solid var(--cobalt); }
  .kicker{
    font-family:var(--mono); font-size:11px; letter-spacing:.16em;
    text-transform:uppercase; color:var(--cobalt); margin:0 0 10px;
  }
  h1.title{ font-size:30px; line-height:1.08; margin:0 0 4px; letter-spacing:-.01em; }
  .subtitle{ font-size:16px; color:var(--ink-soft); margin:0 0 14px; font-weight:500; }
  .meta{
    font-family:var(--mono); font-size:11.5px; color:var(--ink-soft);
    letter-spacing:.04em; display:flex; flex-wrap:wrap; gap:6px 16px;
  }
  .meta b{color:var(--ink)}
  section{padding:26px 0 4px;border-bottom:1px solid var(--line)}
  section:last-of-type{border-bottom:none}
  .sec-head{ display:flex;align-items:baseline;gap:12px;margin:0 0 14px; }
  .sec-num{ font-family:var(--mono); font-size:13px; color:var(--cobalt); font-weight:700; letter-spacing:.08em; }
  .sec-title{ font-size:13px; text-transform:uppercase; letter-spacing:.13em; font-weight:700; margin:0; }
  p{margin:0 0 12px}
  .lead{font-size:15.5px}
  strong{font-weight:700}
  .read-row{margin:0 0 12px;padding-left:14px;border-left:2px solid var(--cobalt)}
  .read-row .tag{
    font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--cobalt);display:block;margin-bottom:2px;
  }
  .alert{ background:var(--amber-band); border-left:4px solid var(--amber); padding:12px 14px; margin:4px 0 16px; border-radius:2px; }
  .alert .tag{
    font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--amber);font-weight:700;display:block;margin-bottom:4px;
  }
  .alert p{margin:0;font-size:14px}
  .card{ background:#FBFCF9; border:1px solid var(--line); border-top:3px solid var(--cobalt); border-radius:3px; padding:16px 16px 6px; margin:0 0 8px; }
  .card h3{margin:0 0 2px;font-size:18px}
  .card .role{ font-family:var(--mono);font-size:11.5px;color:var(--cobalt);letter-spacing:.04em; margin:0 0 12px; }
  .angle{display:flex;gap:10px;margin:8px 0;font-size:14px}
  .angle .lab{
    font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;
    padding:2px 6px;border-radius:2px;flex:0 0 auto;height:fit-content;font-weight:700;
  }
  .angle.go .lab{background:var(--cobalt);color:var(--paper)}
  .angle.no .lab{background:#E7DCC2;color:var(--amber)}
  .contact-line{ font-family:var(--mono);font-size:12px;color:var(--ink-soft); margin:10px 0 4px;padding-top:10px;border-top:1px dashed var(--line); }
  ul.dated{list-style:none;padding:0;margin:0 0 6px}
  ul.dated li{ padding:5px 0;border-bottom:1px solid #E4E6DF;font-size:14px;display:flex;gap:12px; }
  ul.dated li:last-child{border-bottom:none}
  ul.dated .d{ font-family:var(--mono);font-weight:700;color:var(--cobalt); flex:0 0 116px;font-size:12.5px;letter-spacing:.02em; }
  .figs{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:6px 0 18px}
  .fig{background:#FBFCF9;border:1px solid var(--line);border-radius:3px;padding:11px 12px}
  .fig .n{font-family:var(--mono);font-size:19px;font-weight:700;color:var(--cobalt);line-height:1}
  .fig .l{font-size:11.5px;color:var(--ink-soft);margin-top:5px;line-height:1.35}
  .charts{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:10px 0 16px}
  .chart-box{background:#FBFCF9;border:1px solid var(--line);border-radius:3px;padding:12px 8px 8px}
  .chart-cap{ font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase; color:var(--ink-soft);text-align:center;margin:0 0 4px; }
  svg{display:block;width:100%;height:auto}
  .chart-note{font-family:var(--mono);font-size:10px;color:var(--ink-soft);text-align:center;margin:2px 0 0}
  ul.moves{margin:0 0 8px;padding-left:18px}
  ul.moves li{margin:6px 0;font-size:14px}
  .hero{ background:var(--cobalt); color:var(--paper); margin:18px -22px 4px; padding:24px 22px 26px; }
  .hero .sec-head{margin-bottom:6px}
  .hero .sec-num{color:#AFC0FF}
  .hero .sec-title{color:#fff}
  .hero .hint{font-family:var(--mono);font-size:11px;letter-spacing:.05em;color:#C7D2FF;margin:0 0 18px}
  ol.reseaux{list-style:none;counter-reset:r;margin:0;padding:0}
  ol.reseaux li{ counter-increment:r; display:flex;gap:14px;align-items:baseline; padding:13px 0;border-bottom:1px solid rgba(255,255,255,.18); }
  ol.reseaux li:last-child{border-bottom:none}
  ol.reseaux li::before{ content:counter(r,decimal-leading-zero); font-family:var(--mono);font-size:13px;font-weight:700;color:#AFC0FF; flex:0 0 26px; }
  ol.reseaux .q{font-size:17px;line-height:1.32;font-weight:600;letter-spacing:-.005em}
  .axis{margin:0 0 20px}
  .axis h4{ font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase; color:var(--cobalt);margin:0 0 4px; }
  .axis .levier{font-size:13px;color:var(--ink-soft);margin:0 0 10px;font-style:italic}
  ol.deep{margin:0;padding-left:20px}
  ol.deep li{margin:9px 0;font-size:14.5px;line-height:1.4}
  ol.master{list-style:none;counter-reset:m;margin:0;padding:0}
  ol.master li{ counter-increment:m;padding:13px 0;border-bottom:1px solid var(--line); }
  ol.master li:last-child{border-bottom:none}
  ol.master .mh{display:flex;gap:10px;align-items:baseline;margin-bottom:3px}
  ol.master .mn{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--cobalt);flex:0 0 24px}
  ol.master .mt{font-weight:700;font-size:14px}
  ol.master .setup{font-size:12.5px;color:var(--ink-soft);font-style:italic;margin:0 0 4px 34px}
  ol.master .q{font-size:14.5px;margin-left:34px;line-height:1.4}
  ul.check{list-style:none;padding:0;margin:0 0 14px}
  ul.check li{padding:7px 0 7px 26px;position:relative;font-size:14px;border-bottom:1px solid #E4E6DF}
  ul.check li:last-child{border-bottom:none}
  ul.check li::before{ content:"";position:absolute;left:0;top:11px;width:11px;height:11px; border:2px solid var(--cobalt);border-radius:2px; }
  .sources{font-size:12.5px}
  .sources a{color:var(--cobalt);text-decoration:none;border-bottom:1px solid rgba(27,63,191,.3)}
  .sources a:hover{border-bottom-color:var(--cobalt)}
  .sources li{margin:7px 0}
  footer{ font-family:var(--mono);font-size:10.5px;color:var(--ink-soft);letter-spacing:.04em; text-align:center;padding:24px 0 0;line-height:1.7; }
  @media (max-width:520px){
    .figs{grid-template-columns:1fr}
    .charts{grid-template-columns:1fr}
    h1.title{font-size:25px}
    ol.reseaux .q{font-size:16px}
  }
`;
