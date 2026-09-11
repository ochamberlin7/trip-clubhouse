import { HOME_CARD, HOME_CARD_HEADER, HOME_CARD_LABEL, HOME_CARD_TAIL } from './homeCardTokens'

// Shared Home widget shell — the "Classic, Softened" card: white body, 20px
// radius, soft floating shadow, and a solid navy header bar (white bold uppercase
// label left, soft-navy tail right). New Home widgets should wrap their body in
// <HomeCard> rather than re-styling their own card, so the shared shell is the
// default path and an unstyled widget is the exception. (Style tokens live in
// homeCardTokens.js for the few widgets that need a bespoke header.)
export default function HomeCard({ title, tail, children, style }) {
  return (
    <div style={{ ...HOME_CARD, ...style }}>
      <div style={HOME_CARD_HEADER}>
        <span style={HOME_CARD_LABEL}>{title}</span>
        {tail != null && tail !== '' && <span style={HOME_CARD_TAIL}>{tail}</span>}
      </div>
      {children}
    </div>
  )
}
