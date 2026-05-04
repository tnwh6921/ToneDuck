import { translateString, initLanguageToggle, getLanguage } from './translator.js';

export function translateDOM(container) {
    const lang = getLanguage();
    if (lang === 'trad') {
        // Since original text is already mostly traditional, we could still translate just in case 
        // to handle parts that are dynamically modified, but usually 'trad' is the default.
    }
    
    // We walk through all text nodes
    const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodes = [];
    while (node = walk.nextNode()) {
        nodes.push(node);
    }
    
    nodes.forEach(n => {
        // Ignore empty or whitespace-only nodes
        if (n.nodeValue.trim() === '') return;
        
        // Save original text if not already saved
        if (!n.parentElement.hasAttribute('data-orig-text-' + n.nodeType)) {
            // we just store it in an array or map, or safely directly if it's the only text node.
            // Actually, simpler: store on the node object itself!
            if (n.originalText === undefined) {
                n.originalText = n.nodeValue;
            }
        }
        
        const sourceText = n.originalText !== undefined ? n.originalText : n.nodeValue;
        n.nodeValue = translateString(sourceText);
    });
}
