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

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail>0?1:0);
