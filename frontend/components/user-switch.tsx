'use client'

import { useState, type FormEvent } from 'react'

import { useAuth } from '@/components/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shouldShowUserSwitch } from '@/lib/auth-state'

export function UserSwitch() {
	const { authMode, email, switchUser, loading } = useAuth()
	const [nextEmail, setNextEmail] = useState(email)

	if (!shouldShowUserSwitch(authMode)) {
		return null
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const trimmed = nextEmail.trim()
		if (!trimmed) {
			return
		}
		await switchUser(trimmed)
	}

	return (
		<form onSubmit={handleSubmit} className="flex items-center gap-2">
			<Input
				aria-label="Impersonate user"
				placeholder="user@example.com"
				value={nextEmail}
				onChange={(event) => setNextEmail(event.target.value)}
				className="h-8 w-64"
			/>
			<Button type="submit" size="sm" disabled={loading}>
				Switch User
			</Button>
		</form>
	)
}
