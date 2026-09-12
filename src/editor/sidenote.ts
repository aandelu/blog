// A margin note: an inline node whose text the stylesheet floats into the
// right-hand margin. It is written to HTML as
// <span class="sn"><span class="sn-text">note</span></span>, exactly what the
// published page renders, so the editor and the site share one stylesheet.
import { Node, mergeAttributes } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sidenote: {
      insertSidenote: () => ReturnType;
    };
  }
}

export const Sidenote = Node.create({
  name: 'sidenote',
  inline: true,
  group: 'inline',
  content: 'text*',
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'span.sn', contentElement: 'span.sn-text' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'sn' }), ['span', { class: 'sn-text' }, 0]];
  },

  addCommands() {
    return {
      // With text selected, the selection becomes the note. With a bare
      // cursor, a note reading "New note" is inserted with that text
      // selected, so typing replaces it. (An empty inline node cannot hold
      // the cursor, so the placeholder is what makes this work.)
      insertSidenote:
        () =>
        ({ state, tr, dispatch }) => {
          const { from, to, empty } = state.selection;
          const type = state.schema.nodes[this.name];
          if (!type) return false;
          const selected = empty ? '' : state.doc.textBetween(from, to, ' ').trim();
          const text = selected || 'New note';
          const node = type.create(null, state.schema.text(text));
          if (dispatch) {
            tr.replaceWith(from, to, node);
            const start = from + 1;
            tr.setSelection(
              selected
                ? TextSelection.create(tr.doc, start + text.length)
                : TextSelection.create(tr.doc, start, start + text.length),
            );
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-n': () => this.editor.commands.insertSidenote(),
    };
  },
});
