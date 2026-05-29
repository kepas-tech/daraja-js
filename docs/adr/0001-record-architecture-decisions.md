# 1. Record architecture decisions

Date: 2026-05-29

## Status

Accepted

## Context

We need to record the architectural decisions made on this project, so that
future maintainers and contributors understand *why* the code looks the way it
does — especially the non-obvious choices forced by Daraja's behavior.

## Decision

We will use Architecture Decision Records, as described by Michael Nygard, one
markdown file per decision under `docs/adr/`, numbered sequentially. Each ADR
has Status, Context, Decision, and Consequences sections. ADRs are immutable
once accepted; a reversal is a new ADR that supersedes the old one.

## Consequences

Decisions are traceable. Reviewers can point to an ADR instead of relitigating
in every PR. New contributors get the reasoning, not just the result.
