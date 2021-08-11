const FULL_LABEL = 'c3s-unique-';
const LABEL_LEN = 3;
const LABEL = FULL_LABEL.slice(0,LABEL_LEN);
const PREFIX_LEN = 10 + LABEL_LEN;
const PREFIX_BASE = 36;
//const sleep = ms => new Promise(res => setTimeout(res, ms));

import {T} from './externals.js';

T.defCollection("Prefix", {
  container: T`Array`,
  member: T`String`
}, {verify: i => i.length > 0 });

let counter = 1;

const c3s = {scope, rescope};

export default c3s;

export function generateUniquePrefix() {
  counter += 3;
  const number = counter*Math.random()*performance.now()*(+ new Date); 
  const prefixString = (LABEL + number.toString(PREFIX_BASE).replace(/\./,'')).slice(0,PREFIX_LEN);
  return { prefix: [prefixString] };
}

export function extendPrefix({prefix:existingPrefix}) {
  T.guard(T`Prefix`, existingPrefix);
  existingPrefix.push(generateUniquePrefix().prefix[0]);
}

export async function findStyleSheet(link) {
  //await sleep(0);
  let ss;
  const ssFound = Array.from(document.styleSheets).find(({ownerNode}) => ownerNode === link);
  //console.log(ssFound, document.styleSheets[0].ownerNode);
  if ( !ssFound ) {
    console.warn("last error", link);
    throw new TypeError(`Cannot find sheet for link`);
  } else {
    ss = ssFound;
  }

  if ( ss instanceof CSSStyleSheet ) {
    return ss;
  }
}

export function findStyleLink(url) {
  let ss;
  url = getURL(url);
  const ssFound = Array.from(document.styleSheets).find(({href}) => href == url);
  if ( !ssFound ) {
    const qsFound = document.querySelector(`link[href="${url}"]`);
    if ( qsFound ) {
      ss = qsFound;
    }
  } else {
    ss = ssFound.ownerNode;
  }

  if ( ss instanceof HTMLLinkElement ) {
    return ss;
  }
}

export function isStyleSheetAccessible(ss) {
  try {
    Array.from(ss.sheet.cssRules);
    return true;
  } catch(e) {
    return false;
  }
}

// it may actually be better to clone the sheet using
// a style element rather than cloning using the link 
// which may both rely on and recause a network request
export function cloneStyleSheet(ss) {
  //console.log("Cloning", ss);
  const newNode = ss.cloneNode(true);
  newNode.dataset.scoped = true;
  ss.replaceWith(newNode);
  //console.log("New", newNode);
  return newNode;
}

export function prefixAllRules(ss, prefix, combinator = ' ') {
  let lastRuleIndex = ss.cssRules.length - 1;
  let i = lastRuleIndex;

  while(i >= 0) {
    lastRuleIndex = ss.cssRules.length - 1;
    const lastRule = ss.cssRules[lastRuleIndex];
    if ( ! lastRule ) {
      console.warn("No such last rule", lastRuleIndex);
      continue;
    }
    if ( lastRule.type == CSSRule.STYLE_RULE ) {
      prefixStyleRule(lastRule, ss, lastRuleIndex, prefix, combinator)
    } else if ( lastRule.type == CSSRule.MEDIA_RULE ) {
      const rules = Array.from(lastRule.cssRules);
      const lastIndex = rules.length - 1;
      for ( const rule of rules ) {
        prefixStyleRule(rule, lastRule, lastIndex, prefix, combinator);
      }
      ss.deleteRule(lastRuleIndex);
      try {
        let index = 0;
        if ( ss.cssRules.length && ss.cssRules[0].type == CSSRule.NAMESPACE_RULE ) {
          index = 1;
        }
        ss.insertRule(lastRule.cssText, index);
      } catch(e) {
        console.log(e, lastRule.cssText, lastRule, ss);
        //throw e;
      }
    } else {
      ss.deleteRule(lastRuleIndex);
      let index = 0;
      if ( ss.cssRules.length && ss.cssRules[0].type == CSSRule.NAMESPACE_RULE ) {
        index = 1;
      }
      ss.insertRule(lastRule.cssText, index);
    }
    i--;
  }
}

function prefixStyleRule(lastRule, ss, lastRuleIndex, prefix, combinator) {
  let newRuleText = lastRule.cssText;
  const {selectorText} = lastRule;
  const selectors = selectorText.split(/\s*,\s*/g);
  const modifiedSelectors = selectors.map(sel => {
    // we also need to insert prefix BEFORE any descendent combinators
    const firstDescendentIndex = sel.indexOf(' ');
    if ( firstDescendentIndex > -1 ) {
      const firstSel = sel.slice(0, firstDescendentIndex);
      const restSel = sel.slice(firstDescendentIndex);
      // we also need to insert prefix BEFORE any pseudo selectors 
        // NOTE: the following indexOf test will BREAK if selector contains a :
        // such as [ns\\:name="scoped-name"]
      const firstPseudoIndex = firstSel.indexOf(':');
      if ( firstPseudoIndex > -1 ) {
        const [pre, post] = [ firstSel.slice(0, firstPseudoIndex ), firstSel.slice(firstPseudoIndex) ];
        return `${pre}${prefix}${post}${restSel}` + (combinator == '' ? '' : `, ${prefix}${combinator}${sel}`);
      } else return `${firstSel}${prefix}${restSel}` + (combinator == '' ? '' : `, ${prefix}${combinator}${sel}`);
    } else {
      const firstPseudoIndex = sel.indexOf(':');
      if ( firstPseudoIndex > -1 ) {
        const [pre, post] = [ sel.slice(0, firstPseudoIndex ), sel.slice(firstPseudoIndex) ];
        return `${pre}${prefix}${post}` + (combinator == '' ? '' : `, ${prefix}${combinator}${sel}`);
      } else return `${sel}${prefix}` + (combinator == '' ? '' : `, ${prefix}${combinator}${sel}`);
    }
  });
  const ruleBlock = newRuleText.slice(newRuleText.indexOf('{'));
  const newRuleSelectorText = modifiedSelectors.join(', ');
  newRuleText = `${newRuleSelectorText} ${ruleBlock}`;
  ss.deleteRule(lastRuleIndex);
  try {
    let index = 0;
    if ( ss.cssRules.length && ss.cssRules[0].type == CSSRule.NAMESPACE_RULE ) {
      index = 1;
    }
    ss.insertRule(newRuleText, index);
  } catch(e) {
    console.log(e, newRuleText, selectorText, lastRuleIndex, ss);
    //throw e;
  }
}

export async function scopeStyleSheet(url,prefix,combinator = ' ') {
  const ss = findStyleLink(url);

  if ( ! ss ) {
    throw new TypeError(`Stylesheet with URI ${url} cannot be found.`);
  }

  const isKnownAccessible = isStyleSheetAccessible(ss);

  if ( ! isKnownAccessible ) {
    return new Promise(res => {
      ss.onload = () => {
        const isAccessible = isStyleSheetAccessible(ss);
        if ( ! isAccessible ) {
          throw new TypeError(`Non CORS sheet at ${url} cannot have its rules accessed so cannot be scoped.`);
        }
        const scopedSS = cloneStyleSheet(ss);
        scopedSS.onload = async () => {
          const sheet = await findStyleSheet(scopedSS);
          prefixAllRules(sheet,prefix, combinator);
        };
        res(scopedSS);
      };
    });
  } else {
    const scopedSS = cloneStyleSheet(ss);
    return new Promise(res => {
      scopedSS.onload = async () => {
        try {
          const sheet = await findStyleSheet(scopedSS);
          prefixAllRules(sheet,prefix, combinator);
        } catch(e) {
          console.warn(e);
        }
        res(scopedSS);
      };
    });
  }
}

export function scope(url) {
  const prefix = generateUniquePrefix().prefix[0];
  return {scopedSheet: scopeStyleSheet(url,'.' + prefix), prefix};
}

// used when the first scoping didn't work and we need to add more prefix to increase specificity
// if this ever occurs
// which is why we use '' combinator to add to the prefix of the already scoped sheet
export function rescope({scopedSheet, prefix:existingPrefix}) {
  const prefix = generateUniquePrefix().prefix[0];
  const combinator = '';
  prefixAllRules(scopedSheet,prefix,combinator);
  return {scopedSheet, prefix: prefix + existingPrefix};
}

export function getURL(uri) {
  const link = document.createElement('a');
  link.href = uri;
  return link.href;
}
