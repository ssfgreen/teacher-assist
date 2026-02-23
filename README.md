# Design Intuition

The mental model is: **skills provide context, commands provide entry points, agents provide execution capacity.**

A typical flow might be: **teacher types /create-lesson (command) → Claude automatically loads the curriculum-knowledge and pedagogical-principles skills → the command delegates to a curriculum-alignment agent to verify spec coverage and a resource-generator agent to produce supporting materials → results come back into the main conversation.**

Skills will do a lot of the heavy lifting (encoding pedagogical and curricular knowledge), with agents becoming important when we need parallel processing or deep spec-checking that would overwhelm a single context window.
# teacher-assist
