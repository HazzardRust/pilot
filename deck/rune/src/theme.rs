//! The deck.css palette, font, springs and spacing scale (spec 2, L10): names only; values in S4.

#[derive(Debug, Clone, Copy, Default)]
pub struct Tokens;

pub fn tokens(_dark: bool) -> Tokens {
    Tokens
}

pub mod motion {}

pub mod space {}
