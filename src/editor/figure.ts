// A picture with an optional caption. It is written to HTML as
// <figure><img src alt><figcaption>…</figcaption></figure>, exactly what the
// published page renders. Until it is published a picture's src is a data
// URL, and data-name remembers the file it came from.
import { Node } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    figure: {
      insertFigure: (attrs: { src: string; name?: string }) => ReturnType;
    };
  }
}

export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null, parseHTML: (el) => el.querySelector('img')?.getAttribute('src') ?? null },
      name: { default: null, parseHTML: (el) => el.querySelector('img')?.getAttribute('data-name') ?? null },
      // An alt text that merely repeats the caption is regenerated on output.
      alt: {
        default: null,
        parseHTML: (el) => {
          const alt = el.querySelector('img')?.getAttribute('alt') ?? '';
          const caption = el.querySelector('figcaption')?.textContent?.trim() ?? '';
          return alt && alt !== caption ? alt : null;
        },
      },
    };
  },

  parseHTML() {
    return [{
      tag: 'figure',
      contentElement: (el) => (el as HTMLElement).querySelector('figcaption') ?? document.createElement('figcaption'),
    }];
  },

  renderHTML({ node }) {
    const caption = node.textContent.trim();
    const img: Record<string, string> = { src: String(node.attrs.src ?? ''), alt: String(node.attrs.alt || caption) };
    if (node.attrs.name && img.src.startsWith('data:')) img['data-name'] = String(node.attrs.name);
    return ['figure', ['img', img], ['figcaption', 0]];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('figure');
      const img = document.createElement('img');
      img.draggable = false;
      img.contentEditable = 'false';
      // Clicking the picture selects the whole figure, so Delete removes it.
      img.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const pos = getPos();
        if (typeof pos !== 'number') return;
        editor.view.focus();
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
      });
      const caption = document.createElement('figcaption');
      dom.append(img, caption);
      const apply = (n: typeof node) => {
        img.src = String(n.attrs.src ?? '');
        img.alt = String(n.attrs.alt ?? '');
      };
      apply(node);
      return {
        dom,
        contentDOM: caption,
        update(updated) {
          if (updated.type !== node.type) return false;
          apply(updated);
          return true;
        },
        ignoreMutation(mutation) {
          return mutation.type !== 'selection' && !caption.contains(mutation.target);
        },
      };
    };
  },

  addCommands() {
    return {
      // Inserts the picture at the cursor and leaves the cursor in its caption.
      insertFigure:
        (attrs) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes[this.name];
          if (!type) return false;
          const node = type.create({ src: attrs.src, name: attrs.name ?? null });
          if (dispatch) {
            const from = state.selection.from;
            tr.replaceSelectionWith(node);
            const start = Math.max(0, tr.mapping.map(from, -1) - 2);
            const end = Math.min(tr.doc.content.size, start + node.nodeSize + 4);
            let at = -1;
            tr.doc.nodesBetween(start, end, (n, pos) => {
              if (at < 0 && n.type === type && n.attrs.src === attrs.src) at = pos;
              return at < 0;
            });
            if (at >= 0) tr.setSelection(TextSelection.create(tr.doc, at + 1));
            dispatch(tr.scrollIntoView());
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter in a caption moves on to the paragraph below instead of
      // splitting the figure into two copies of the picture.
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parent.type.name !== this.name) return false;
        const after = $from.after();
        const next = state.doc.nodeAt(after);
        if (next && next.type.name === 'paragraph') return this.editor.commands.setTextSelection(after + 1);
        return this.editor.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).run();
      },
      // Backspace in an empty caption removes the picture. Undo brings it back.
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parent.type.name !== this.name || $from.parent.content.size > 0) return false;
        return this.editor.commands.deleteNode(this.name);
      },
    };
  },

  addProseMirrorPlugins() {
    const type = this.type;
    return [
      // Marks figures without a caption so the stylesheet can show a hint.
      new Plugin({
        key: new PluginKey('figureCaptionHint'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type === type && node.childCount === 0) {
                decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'no-caption' }));
              }
              return node.type !== type;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
