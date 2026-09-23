import { priceDeal, pricePortfolio, type QuoteInput, type PortfolioInput } from "./pricing";
const usd=(n:number|null)=>n===null?"—":"$"+Math.round(n).toLocaleString();
let pass=0, fail=0;
const check=(name:string, cond:boolean, detail:string)=>{ (cond?pass++:fail++); console.log(`  ${cond?"PASS":"**FAIL**"}  ${name}  ${detail}`); };

const gu = (o: Partial<QuoteInput>={}): QuoteInput => ({
  product:"new_construction", channel:"tpo", fico:800, experienceBucket:3, licensedAgentOrGc:false,
  rural:false, residency:"us_citizen", loanAmount:3_580_000, units:1, loanPurpose:"cash_out_refi",
  brokerPointsPct:0, brokerProcessingFee:0, estimatedPayoff:0, purchasePrice:2_800_000,
  constructionBudget:3_300_000, holdbackPct:1, sunkCosts:0, arv:10_000_000, extendedTerm:false,
  permitsInHand:true, financedInterestReserve:false, interestReserveMonths:12,
  initialAdvancePct:0.10, ...o } as QuoteInput);

console.log("\n=== 1. Luis's reported scenario reproduces, and financing now helps ===");
const a=priceDeal(gu());
const b=priceDeal(gu({financedInterestReserve:true}));
console.log(`  unfinanced: loan ${usd(a.loanAmount)}  reserve ${usd(a.interestReserve)}  cashToClose ${usd(a.cashToClose)}  toBorrower ${usd(a.cashToBorrower)}`);
console.log(`  FINANCED  : loan ${usd(b.loanAmount)}  reserve ${usd(b.interestReserve)}  financed ${usd(b.financedReserve)}  cashToClose ${usd(b.cashToClose)}  toBorrower ${usd(b.cashToBorrower)}`);
check("financing the reserve now HELPS the borrower", (b.cashToBorrower??0) > (a.cashToBorrower??0) || (b.cashToClose??0) < (a.cashToClose??0),
  `borrower receives ${usd(b.cashToBorrower)} instead of bringing ${usd(a.cashToClose)}`);
check("financed reserve is in the loan", b.loanAmount === a.loanAmount + b.financedReserve, `${usd(a.loanAmount)} + ${usd(b.financedReserve)} = ${usd(b.loanAmount)}`);

console.log("\n=== 2. Day-one payment is reported alongside fully-drawn ===");
check("day-one payment present and much lower", a.estMonthlyAtInitial !== null && a.estMonthlyAtInitial < (a.estMonthlyPayment??0)/5,
  `day-one ${usd(a.estMonthlyAtInitial)} vs full-draw ${usd(a.estMonthlyPayment)}`);

console.log("\n=== 3. Financed reserve cannot breach the ARLTV cap ===");
const tight=priceDeal(gu({purchasePrice:500_000, constructionBudget:500_000, arv:1_150_000,
  loanAmount:850_000, initialAdvancePct:0.7, interestReserveMonths:12, financedInterestReserve:true}));
const arltvPct=(tight.arltv ?? tight.primaryRatio ?? 0)*100;
check("ARLTV stays within 75%", arltvPct <= 75.01, `ARLTV ${arltvPct.toFixed(2)}%  loan ${usd(tight.loanAmount)}`);

console.log("\n=== 4. No ARV: financing says so instead of reporting $0 fits ===");
const noArv=priceDeal(gu({product:"fix_and_flip", arv:0, rehabBudget:100_000, constructionBudget:0,
  loanAmount:400_000, purchasePrice:400_000, financedInterestReserve:true, experienceBucket:2}));
check("honest no-ARV warning", noArv.warnings.some(w=>/After-Repair Value/.test(w)) && !noArv.warnings.some(w=>/only \$0 fits/.test(w)),
  noArv.warnings.find(w=>/Repair Value/.test(w))?.slice(0,60) ?? "(none)");

console.log("\n=== 5. Blocker names the cap that actually binds ===");
const wrongCap=priceDeal(gu({product:"fix_and_flip", purchasePrice:400_000, rehabBudget:100_000,
  constructionBudget:0, arv:900_000, loanAmount:460_000, fico:700, experienceBucket:1, initialAdvancePct:0.9}));
const bl=wrongCap.blockers.map(x=>x.reason).join(" | ");
check("does not blame a non-binding ARLTV", !/75% ARLTV max of \$675,000/.test(bl), bl.slice(0,110) || "(no blockers)");

console.log("\n=== 6. DSCR floor gates on the unrounded ratio ===");
const dscrIn=(rent:number):QuoteInput=>({product:"dscr",channel:"retail",fico:740,experienceBucket:2,
  licensedAgentOrGc:false,rural:false,residency:"us_citizen",loanAmount:300_000,units:1,
  loanPurpose:"purchase",estimatedPayoff:0,purchasePrice:400_000,asIsValue:400_000,monthlyRent:rent,
  annualTaxes:4000,annualInsurance:1500,annualHoa:0,interestOnly:true,dscrTerm:"frm_30",ppp:"ppp_5yr"} as QuoteInput);
const edge=priceDeal(dscrIn(2000));
const raw = edge.dscr;
check("1.04x does not sneak through as 1.05", !(raw===1.05 && edge.ok===true && (edge.blockers.length===0)) || raw>1.05,
  `displayed DSCR ${raw}  ok=${edge.ok}`);

console.log("\n=== 7. Portfolio: IR band cannot buy construction dollars ===");
const pf=(o:Partial<PortfolioInput>={}):PortfolioInput=>({product:"new_construction",channel:"retail",fico:740,
  experienceBucket:3,licensedAgentOrGc:false,rural:false,residency:"us_citizen",multiUnit:false,
  loanPurpose:"purchase",extendedTerm:false,permitsApproved:true,financedInterestReserve:false,
  defaultInitialLtcPct:0.75,holdbackPct:1,dscrTerm:"frm_30",ppp:"ppp_5yr",interestOnly:false,
  defaultTargetLtvPct:0.75,properties:[{id:"1",address:"a",asIsValue:600_000,budget:1_400_000,sunkCosts:0,
  estimatedPayoff:0,arv:3_000_000,monthlyRent:0,annualTaxes:0,annualInsurance:0,annualHoa:0,loanOverride:1_800_000}],
  ...o} as PortfolioInput);
const off=pricePortfolio(pf()), on=pricePortfolio(pf({financedInterestReserve:true}));
check("ticking financed reserve does not raise the construction cap",
  off.properties[0].maxTotalLoan === on.properties[0].maxTotalLoan,
  `cap off ${usd(off.properties[0].maxTotalLoan)} vs on ${usd(on.properties[0].maxTotalLoan)}`);
check("construction cap is 85% of cost", Math.abs(off.properties[0].maxTotalLoan - 0.85*2_000_000) < 2,
  `${usd(off.properties[0].maxTotalLoan)} vs 85% = ${usd(1_700_000)}`);

console.log("\n=== 8. Portfolio: Foreign National LTV tightening applied ===");
const fnPf=pricePortfolio({...pf(),product:"dscr",residency:"foreign_national",loanPurpose:"purchase",
  defaultTargetLtvPct:0.75, properties:[{id:"1",address:"a",asIsValue:2_000_000,budget:0,sunkCosts:0,
  estimatedPayoff:0,arv:0,monthlyRent:18_000,annualTaxes:12_000,annualInsurance:4_000,annualHoa:0,loanOverride:1_500_000}]} as PortfolioInput);
check("FN cap tightened to 65%", fnPf.ltvCapPct <= 0.6501, `ltvCapPct ${(fnPf.ltvCapPct*100).toFixed(1)}%`);

console.log("\n=== 9. Portfolio: Stabilized Bridge is rejected, not mispriced ===");
const sb=pricePortfolio({...pf(),product:"stabilized_bridge"} as PortfolioInput);
check("stabilized bridge blocked in portfolio", sb.ok===false && sb.blockers.some(b=>/Stabilized Bridge/.test(b.reason)),
  sb.blockers.map(b=>b.reason)[0] ?? "(none)");

console.log("\n=== 10. Committee benchmark still reproduces at 9.69% ===");
const bench=priceDeal(gu({channel:"retail",fico:720,purchasePrice:40_000,constructionBudget:370_000,
  arv:470_000,loanAmount:347_803,initialAdvancePct:0,holdbackPct:0.95,interestReserveMonths:1,
  loanPurpose:"rate_term_refi",financedInterestReserve:false}));
check("Ground-Up rate card intact", bench.ratePct===9.69, `rate ${bench.ratePct}%  tier ${bench.tier}`);

console.log("\n=== 11. Ground-Up LTFC is TIER-AWARE — Tier 5 earns 90% ===");
/*
 * The bug this section exists to prevent coming back.
 *
 * The committee raised Tier 5 Ground-Up to 90% LTFC on 30 July 2026. The engine
 * stayed flat at 85% for every tier until 23 Sep, so a Tier 5 builder was
 * quoted five points of cost less than they qualified for — with no error, no
 * warning, and nothing in the output that looked wrong. A broker reading that
 * term sheet had no way to know.
 *
 * The fixture is built so the LTFC leg BINDS at both tiers: the initial-advance
 * leg (0.75 x cost basis + build) and the ARLTV leg are both set clear of it,
 * so any change in the answer is the LTFC cap and nothing else.
 */
const tierDeal = (bucket: number, o: Partial<QuoteInput> = {}): QuoteInput => gu({
  experienceBucket: bucket,
  purchasePrice: 1_000_000,
  constructionBudget: 4_000_000,   // full cost 5,000,000
  sunkCosts: 0,
  arv: 10_000_000,                 // 75% ARLTV = 7,500,000 — never binds
  loanAmount: 9_000_000,           // ask for more than any cap allows
  initialAdvancePct: 0.10,
  financedInterestReserve: false,
  ...o,
});

const t4 = priceDeal(tierDeal(3));   // bucket 3 -> Tier 4
const t5 = priceDeal(tierDeal(4));   // bucket 4 -> Tier 5

check("fixture really is Tier 4 and Tier 5", t4.tier === 4 && t5.tier === 5, `tiers ${t4.tier} / ${t5.tier}`);
check("Tier 4 caps construction dollars at 85% of cost", t4.maxLoan === 4_250_000, usd(t4.maxLoan));
check("Tier 5 caps construction dollars at 90% of cost", t5.maxLoan === 4_500_000, usd(t5.maxLoan));
// The money. Five points of a $5M project.
check("Tier 5 is offered $250,000 MORE than Tier 4", (t5.maxLoan ?? 0) - (t4.maxLoan ?? 0) === 250_000,
  `${usd(t4.maxLoan)} -> ${usd(t5.maxLoan)}`);
check("Tier 3 is still 85%, not promoted by accident", priceDeal(tierDeal(2)).maxLoan === 4_250_000, usd(priceDeal(tierDeal(2)).maxLoan));

console.log("\n=== 12. The reserve band rides on top, and it is tier-aware too ===");
/*
 * MY FIRST VERSION OF THIS TEST WAS WRONG and it is worth recording why.
 *
 * I asked for $4.6M with a financed reserve and expected Tier 5 to allow it,
 * because 4.6 is under the 95% all-in ceiling. It was blocked, correctly: the
 * requested amount is the CONSTRUCTION loan, and the engine adds the financed
 * reserve on top of it (section 1 proves loan = request + financedReserve). So
 * $4.6M of construction does exceed Tier 5's 90% construction cap, and the
 * engine was right while the test was wrong.
 *
 * The band is therefore tested where it actually lives: on the size of the
 * financed reserve and the total it produces.
 */
const atCap = (bucket: number, ask: number) =>
  priceDeal(tierDeal(bucket, { financedInterestReserve: true, interestReserveMonths: 12, loanAmount: ask }));

const t4full = atCap(3, 4_250_000);  // exactly Tier 4's construction cap
const t5full = atCap(4, 4_500_000);  // exactly Tier 5's construction cap

check("Tier 4 at its construction cap still clears", t4full.ok === true,
  t4full.blockers.map(b => b.reason)[0]?.slice(0, 80) ?? "allowed");
check("Tier 5 at its construction cap still clears", t5full.ok === true,
  t5full.blockers.map(b => b.reason)[0]?.slice(0, 80) ?? "allowed");

// 5% of $5,000,000 full cost. The band is the same width at both tiers; what
// moved is where it starts.
check("Tier 4 reserve headroom stops at 5% of cost", t4full.financedReserve <= 250_000 + 1, usd(t4full.financedReserve));
check("Tier 5 reserve headroom stops at 5% of cost", t5full.financedReserve <= 250_000 + 1, usd(t5full.financedReserve));
check("Tier 4 all-in never passes 90% of cost", t4full.loanAmount <= 4_500_000 + 1, usd(t4full.loanAmount));
check("Tier 5 all-in never passes 95% of cost", t5full.loanAmount <= 4_750_000 + 1, usd(t5full.loanAmount));
// The band must never become build money at either tier.
check("Tier 5 construction dollars stay at 90%",
  t5full.loanAmount - t5full.financedReserve <= 4_500_000 + 1,
  `loan ${usd(t5full.loanAmount)} less reserve ${usd(t5full.financedReserve)}`);
// And the whole point: Tier 5's all-in beats Tier 4's.
check("Tier 5 ends up with more money than Tier 4",
  t5full.loanAmount > t4full.loanAmount,
  `${usd(t4full.loanAmount)} -> ${usd(t5full.loanAmount)}`);

console.log("\n=== 13. The blocker NAMES the tier's own cap ===");
// A Tier 5 broker told "85% LTFC" beside a 90% number is how two months of
// under-quoting would have been caught, and was not.
const t4why = t4.blockers.map(b => b.reason).join(" | ");
const t5why = t5.blockers.map(b => b.reason).join(" | ");
check("Tier 4 is told 85% LTFC", /85% LTFC/.test(t4why), t4why.slice(0, 100) || "(no blockers)");
check("Tier 5 is told 90% LTFC", /90% LTFC/.test(t5why), t5why.slice(0, 100) || "(no blockers)");
check("...and Tier 5 is never told 85%", !/85% LTFC/.test(t5why), t5why.slice(0, 100) || "(no blockers)");

console.log("\n=== 14. Portfolio honours the same tier rule ===");
const pf4 = pricePortfolio({ ...pf(), experienceBucket: 3 } as PortfolioInput);
const pf5 = pricePortfolio({ ...pf(), experienceBucket: 4 } as PortfolioInput);
check("portfolio reports the tier", pf4.tier === 4 && pf5.tier === 5, `${pf4.tier} / ${pf5.tier}`);
check("Tier 4 portfolio caps at 85% LTFC", pf4.ltfcCapPct === 0.85, String(pf4.ltfcCapPct));
check("Tier 5 portfolio caps at 90% LTFC", pf5.ltfcCapPct === 0.9, String(pf5.ltfcCapPct));

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail>0?1:0);
