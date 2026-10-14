import type { RecoveryAdapter } from '../types/auth'

// A separate, memory-only simulation. Never creates an authenticated user.
export function createRecoveryPrototype(): RecoveryAdapter {
  let codeDeadline = Date.now() + 300000
  let tokenDeadline = 0
  const pause = () => new Promise((resolve) => setTimeout(resolve, 350))
  return {
    async forgot() {
      await pause()
      codeDeadline = Date.now() + 300000
      tokenDeadline = 0
      return { status: 'accepted', otp_expires_in: 300, resend_after: 60 }
    },
    async verifyOtp({ otp }) {
      await pause()
      if (otp !== '123456' || Date.now() >= codeDeadline) throw new Error('DEMO_OTP')
      codeDeadline = 0
      tokenDeadline = Date.now() + 300000
      return { reset_token: 'prototype-memory-token', expires_in: 300 }
    },
    async resetPassword() {
      await pause()
      if (Date.now() >= tokenDeadline) throw new Error('DEMO_TOKEN')
      tokenDeadline = 0
      return { status: 'reset' }
    },
  }
}
