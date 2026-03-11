---
name: cozybase
description: Use CozyBase to create apps, modify apps, and use apps that already run inside CozyBase.
---

# CozyBase Skill

## When to use this skill

Use this skill when:

- the user wants to use CozyBase to create an app
- the user wants to use CozyBase to modify an existing app
- the user wants to use an app that already exists inside CozyBase

## What CozyBase is

CozyBase is a local Supabase-like platform designed for AI Agents. Users can use CozyBase to quickly create any kind of app, then use those apps to satisfy their real needs.

## Core capabilities

CozyBase can help with:

- list apps
- get app detail
- create an app
- develop an app
- use the apps that already exist in CozyBase

## How to use CozyBase

Call the CozyBase agent through:

`acpx cozybase exec "<Prompt text>"`

Use a prompt that clearly states:

- whether the user wants to create, modify, or use an app
- the app name if known
- the desired business goal or task

## Execution note

Prefer delegating the full app-oriented intent to CozyBase first, instead of manually decomposing work outside the CozyBase agent.
