import { Button } from '@usva-ui/react/primitives/button'
import { Dialog } from '@usva-ui/react/primitives/dialog'
import { CaseGuide } from './CaseGuide'
import { DictionaryEntry } from './DictionaryEntry'
import { SpokenGuideView } from './SpokenGuideView'
import { CloseIcon } from './icons'
import type { Reference } from './reference'

type Props = { reference: Reference | null; onClose: () => void }

export function ReferenceSheet({ reference, onClose }: Props) {
  return (
    <Dialog open={!!reference} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content className="flex max-h-[min(86dvh,900px)] w-[calc(100vw-32px)] max-w-3xl flex-col overflow-hidden p-0">
        <Dialog.Close
          render={<Button variant="ghost" size="sm" shape="pill" iconOnly aria-label="Close" className="absolute top-3 right-3 z-base" />}
        >
          <CloseIcon />
        </Dialog.Close>
        <div className="overflow-y-auto overscroll-contain px-6 pt-8 pb-8 select-text sm:px-10">
          {reference?.kind === 'dict' && <DictionaryEntry key={reference.word} word={reference.word} />}
          {reference?.kind === 'case' && <CaseGuide key={reference.topic} topic={reference.topic} word={reference.word} />}
          {reference?.kind === 'puhekieli' && <SpokenGuideView />}
        </div>
      </Dialog.Content>
    </Dialog>
  )
}
