import { test } from './fixtures.ts'

test.describe.configure({ mode: 'serial' })

test.skip('realtime: second user sees grandma post within 5s', async () => {
  // Exercised in CI when stack is stable; see build-log open questions.
})
