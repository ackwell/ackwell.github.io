---
title: creating a dynamic union in typescript.
---

thanks to automatic type narrowing, a properly discriminated union is an incredibly powerful tool to model data in typescript. unfortunately, as the model grows more complex, it becomes increasingly easy to disrupt the key discriminators of the union - and equally becomes a point of contention for vcs conflicts.

in a (long overdue) effort to move [xivanalysis'](https://github.com/xivanalysis/xivanalysis) event structure into a union, the above issues became quite prominent. in addition to the "core" set of events available throughout the analysis framework, individual modules are able to "fabricate" their own bespoke events, that can be consumed elsewhere. were we to naively define events as a single union in a central location, it would quickly become cumbersome.

as it turns out we can resolve these issues with [declaration merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html), and a little sprinkle of [mapped types](https://www.typescriptlang.org/docs/handbook/advanced-types.html#mapped-types). let's dive in!

----

### building the interface.

for our first trick, we'll be using declaration merging to consolidate type definitions spread across multiple files into a single interface we can work with. merging is a feature dating all the way back to typescript 1.0 (or earlier!), but it sees reduced usage in the modern world of es modules.

to start, we'll need to define the "target" of the merges we'll be performing:

```ts
// events.ts
export interface EventTypeRepositoy {}
```

yep, that's really all you need - an exported blank interface. all declarations will point at this interface, and merge further information in. it also provides a handy location for us to perform further type operations, which i'll be covering later in this post.

from this point, you can start merging your types in:

```ts
// coffee-machine.ts
interface BrewUpdate {
  progress: number
  // i'll let you imagine the rest of the fields here
}

declare module 'events' {
  interface EventTypeRepository {
    brewUpdate: BrewUpdate
  }
}
```

the key thing to note here is the `declare module` syntax. with es modules, the repository "belongs" to the events module - so we're borrowing typescript's ability to override and declare types cross-module to sneak into the events module and fiddle around a bit.

with that done, we've magically included our `BrewUpdate` interface as a key in that repository. you can check to see that it's working by inspecting the type of `keyof EventTypeRepository` in `events.ts` - it should now be the string literal `'brewUpdate'`!

repeat this process a few times - it can be done across any number of files, with an arbitrary number of declarations in each.

----

### creating the discriminated union.

the key to a well discriminated union is that _every_ member must have some combination of properties that, when combined, uniquely identify that member. the simplest way to reach this point is for every single member to share a property definition, each with a unique literal type.

because we're merging our definitions into an interface, we actually have something matching that property ready to go - the keys of the interface themselves! so, let's write up a neat little mapped type to translate our interface into a discriminated union:

```ts
// events.ts
export interface EventTypeRepositoy {}

type BuildUnion<T> = {
  [K in keyof T]: { type: K } & T[K]
}[keyof T]

type Events = BuildUnion<EventTypeRepository>

/* Result:
type Events =
  | { type: 'brewUpdate', progress: number, ... }
  | { type: 'someOtherEvent', ...}
  | ...
*/
```

let's dice that up a bit. at the core of `BuildUnion<T>` is the mapped type `{ [K in keyof T]: T[K] }`. by itself, this is essentially a no-op: each key in `T` is mapped to its existing value `T[K]` - but it splits the type up so we're able to modify it as we go.

and modify it we do! we're intersecting the existing value type `T[K]` with the new `{ type: K }` - essentially, injecting a `type` key into every registered event, with it's value as the literal type of the key in the interface it was registered as. this property acts as the backbone for our discriminated union - it's the shared property that can be used to discriminate between types. it's worth noting that the key `type` is arbitrary - pick a name that fits the data you're modelling!

finally, we're indexing this newly-formed type with a union of its keys, essentially transforming an object type into a union. a simpler example of this trick would be something like the following:

```ts
type Example = {
  tea: 'camellia sinensis',
  coffee: 'coffea arabica',
}

type AsUnion = Example[keyof Example]
// type AsUnion = "camellia sinensis" | "coffea arabica"
```

----

### conclusion.

and that just about wraps it up! putting those few tricks together, you're left with a union with a guaranteed strong discriminating property, that you can add members to from any appropriate location within your codebase. no remembering to remove your union member when you retire a module - just delete the file and it's gone!

it's worth noting that the exact types used in xiva, that inspired this post, are slightly different (and slightly more naive) - times and ideas change!

if you got this far, thanks for sticking along with the ride, drop a line on twitter or discord if there's any questions you'd like to ask (or bugs i should fix).
