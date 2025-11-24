// main.js
const { Plugin } = require('obsidian');

module.exports = class JunosPlugin extends Plugin {
  async onload() {
    // Register Prism language for reading mode
    if (window.Prism && window.Prism.languages) {
      window.Prism.languages.junos = {
        'comment': { pattern: /#.*/m },
        'placeholder': { pattern: /<[^>]+>/, greedy: true },
        'user-input': { pattern: /\b[A-Z][A-Z0-9_]{2,}\b/, greedy: true },
        'command': { pattern: /(^|[>#]\s+)\b(set|delete|edit|activate|deactivate|insert|rename|copy|replace|show|run|configure|commit|rollback|exit|quit|top|up|annotate|load|save|request|restart|test|monitor|ping|traceroute|clear)\b/m, lookbehind: true },
        'ip-address': { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/ },
        'interface': { pattern: /\b(ge|xe|et|ae|lo|em|fxp|irb|vlan|reth)-\d+\/\d+\/\d+(?:\.\d+)?\b|\b(ge|xe|et|ae|lo|em|fxp|irb|vlan|reth)-\d+\/\d+(?:\.\d+)?\b|\b(st|gr|ip|lt|mt|sp|lsi|fab|vme|dsc|gre|ipip|lc|pfe|pfh|vt|vcp|vtep|pp|rbeb|esi|jsrv|tap|demux|pime|pimd|mams)\d+\.\d+\b|\b(ae|lo|em|fxp|irb|vlan|st|gr|lsi|reth)\d+\b(?!\s+unit)/ },
        'number': { pattern: /\b\d+\b/ },
        'string': { pattern: /"[^"]*"/, greedy: true },
      };
    }

    // Register CodeMirror 5 mode for legacy editor support
    const CodeMirror = window.CodeMirror;
    if (CodeMirror && CodeMirror.defineMode) {
      CodeMirror.defineMode('junos', function() {
        const commands = new Set(['set', 'delete', 'edit', 'activate', 'deactivate', 'insert', 'rename', 'copy', 'replace', 'show', 'run', 'configure', 'commit', 'rollback', 'exit', 'quit', 'top', 'up', 'annotate', 'load', 'save', 'request', 'restart', 'test', 'monitor', 'ping', 'traceroute', 'clear']);
        
        return {
          startState: function() { return { sol: true, afterPrompt: false }; },
          token: function(stream, state) {
            // Track start of line
            if (stream.sol()) {
              state.sol = true;
              state.afterPrompt = false;
            }
            
            // Skip shell prompts (user@host> or user@host# )
            if (state.sol && stream.match(/^[^\s]+@[^\s]+[>#]\s+/)) {
              state.afterPrompt = true;
              state.sol = false;
              return null;
            }
            
            // Comments
            if (stream.match(/#.*/)) return 'junos-comment';
            
            // Placeholders - angle bracket like <HOSTNAME>
            if (stream.match(/<[^>]+>/)) return 'junos-placeholder';
            
            // Strings - quoted strings
            if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'junos-string';
            
            // IP addresses and subnets (check before plain numbers)
            if (stream.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/)) return 'junos-ip-address';
            
            // Interfaces - more specific patterns to avoid consuming unit numbers
            if (stream.match(/\b(ge|xe|et|ae|lo|em|fxp|irb|vlan|reth)-\d+\/\d+\/\d+(?:\.\d+)?\b/)) {
              return 'junos-interface';
            }
            if (stream.match(/\b(ge|xe|et|ae|lo|em|fxp|irb|vlan|reth)-\d+\/\d+(?:\.\d+)?\b/)) {
              return 'junos-interface';
            }
            if (stream.match(/\b(st|gr|ip|lt|mt|sp|lsi|fab|vme|dsc|gre|ipip|lc|pfe|pfh|vt|vcp|vtep|pp|rbeb|esi|jsrv|tap|demux|pime|pimd|mams)\d+(?:\.\d+)?\b/)) {
              return 'junos-interface';
            }
            if (stream.match(/\b(ae|lo|em|fxp|irb|vlan)\d+\b/)) {
              return 'junos-interface';
            }
            
            // Plain numbers (unit numbers, VLAN IDs, etc.)
            if (stream.match(/\b\d+\b/)) return 'junos-number';
            
            // Commands at start of line or after prompt
            if ((state.sol || state.afterPrompt) && stream.match(/\b[a-z]+\b/)) {
              const word = stream.current();
              if (commands.has(word)) {
                state.sol = false;
                state.afterPrompt = false;
                return 'junos-command';
              }
              // Put it back if not a command
              stream.backUp(word.length);
            }
            
            // ALL_CAPS user inputs (3+ chars)
            if (stream.match(/\b[A-Z][A-Z0-9_]{2,}\b/)) {
              return 'junos-user-input';
            }
            
            // Skip whitespace
            if (stream.eatSpace()) {
              return null;
            }
            
            // Mark that we're past start of line
            if (!stream.match(/^\s*$/)) {
              state.sol = false;
            }
            
            // Default: advance one character
            stream.next();
            return null;
          }
        };
      });
      
      if (CodeMirror.defineMIME) {
        CodeMirror.defineMIME('text/x-junos', 'junos');
      }
      
      // Register mode info so it appears in language selection
      if (CodeMirror.modeInfo) {
        CodeMirror.modeInfo.push({
          name: 'Junos',
          mime: 'text/x-junos',
          mode: 'junos',
          ext: ['junos']
        });
      }
    }

    // Register editor extensions for proper code block handling
    this.registerEditorExtension([]);

    // Register code block post-processor for reading mode
    this.registerMarkdownPostProcessor((element, context) => {
      // Find both pre>code.language-junos and just code.language-junos
      const codeBlocks = element.querySelectorAll('code.language-junos, pre code[class*="language-junos"]');
      
      codeBlocks.forEach((codeBlock) => {
        // Only process if Prism is available and block hasn't been processed
        if (window.Prism && window.Prism.languages.junos && !codeBlock.classList.contains('junos-processed')) {
          const code = codeBlock.textContent;
          codeBlock.innerHTML = window.Prism.highlight(code, window.Prism.languages.junos, 'junos');
          codeBlock.classList.add('junos-processed');
        }
      });
    });
    
    console.log('Junos Syntax Highlighting plugin loaded');
  }

  onunload() {
    console.log('Junos Syntax Highlighting plugin unloaded');
  }
};