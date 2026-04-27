import { z } from 'zod'

export const userInfoSchema = z.object({
  email: z.string().email(),
  is_admin: z.boolean(),
  auth_mode: z.enum(['oidc', 'insecure']),
})

export type UserInfo = z.infer<typeof userInfoSchema>
