"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * A model's answer, rendered as the Markdown it actually is.
 *
 * Models answer in Markdown whether or not anyone asked them to, so printing
 * the text raw put literal `**`, `###`, and `*` on screen and made every
 * structured answer harder to read than the same words in a plain paragraph.
 * That is worse here than in most products: the arena exists to compare
 * answers, and formatting noise is not a difference between models, it is a
 * difference this app was adding on top of them.
 *
 * No raw HTML, deliberately. Model output is untrusted text from a third party,
 * and `react-markdown` escapes embedded HTML unless `rehype-raw` is added,
 * which is exactly why it is not added. Link targets go through the library's
 * own URL transform, which drops `javascript:` and friends.
 *
 * It re-parses on every chunk while streaming. That is the honest cost of
 * rendering formatting live rather than only once the answer lands, and at the
 * size of these answers it is not measurable next to the network.
 */
export const AnswerText = ({ text }: { readonly text: string }) => (
  <Markdown
    remarkPlugins={[remarkGfm]}
    components={{
      // Anything a model links to is somebody else's page.
      //
      // The props are named rather than spread on purpose. `react-markdown`
      // hands every custom component its own `node`, and spreading the rest put
      // a literal `node="[object Object]"` attribute into the anchor, which was
      // visible in the rendered markup. Taking only what an anchor needs means
      // nothing internal can leak into the DOM.
      a: ({ href, title, children }) => (
        <a
          href={href}
          title={title}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {children}
        </a>
      ),
    }}
  >
    {text}
  </Markdown>
);
