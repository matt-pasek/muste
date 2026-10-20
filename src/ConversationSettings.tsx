import { Button } from '@usva-ui/react/primitives/button'
import { Popover } from '@usva-ui/react/primitives/popover'
import { SettingsIcon } from './icons'
import { RegisterToggle } from './RegisterToggle'
import { SpeedToggle } from './SpeedToggle'
import type { Register } from './useRegister'

type Props = { register: Register; onRegister: (r: Register) => void; onNewScene: () => void; busy: boolean }

export function ConversationSettings({ register, onRegister, onNewScene, busy }: Props) {
  return (
    <Popover>
      <Popover.Trigger render={<Button variant="ghost" shape="pill" iconOnly aria-label="Conversation settings" />}>
        <SettingsIcon />
      </Popover.Trigger>
      <Popover.Content side="bottom" align="end" sideOffset={10} className="z-toast w-[min(320px,calc(100vw-32px))]">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <Popover.Title className="text-sm">How Aino speaks</Popover.Title>
            <RegisterToggle value={register} onChange={onRegister} />
          </section>
          <section className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">Playback speed</p>
            <SpeedToggle />
          </section>
          <div className="h-px bg-border" />
          <Button variant="soft" disabled={busy} onClick={onNewScene}>Start a new scene</Button>
        </div>
      </Popover.Content>
    </Popover>
  )
}
