---
title: a journey into search.
---

I've recently wrapped up the core implementation of a search feature - one that went through many twists and turns. It was a long journey to get to where it stands today, and I'd like to revisit that journey to share some of my learnings (and mistakes)!

The feature was written as part of [boilmaster](https://github.com/ackwell/boilmaster), a web service written in rust that offers an HTTP API for accessing game data from Final Fantasy XIV. boilmaster did not start development in a vacuum - from the outset, it was designed to replace the existing server software powering [xivapi](https://xivapi.com). As such, many of its requirements and implementation decisions stem from old learnings and pain points experienced by the maintainers of that service.

Relevant to this tale are it's requirements around ongoing maintenance work - or rather, the lack thereof. We want to reduce the manual intervention to keep the system running to the absolute minimum possible. To this end, the service is able to automatically update the game data it uses, as well as the community-contributed schema declarations used to read the data.

We start the journey into search with, of all things, a search engine library.

----

### tantivy: a paradise.

I begun by spiking out an implementation of search over a reduced dataset using [tantivy](https://github.com/quickwit-oss/tantivy) - a search engine library akin in purpose to lucene, written in rust.

Our schemas are rarely comprehensive, and may change regularly as discoveries are made and mistakes are fixed. As a consequence, an early choice was to completely decouple the data in the search engine from those schemas. An incoming search query would first be "normalised", replacing schema-driven naming and structures with a flattened query targeting data directly by its position in raw file structure.

Early results were promising! Query speed was well and truly beyond what I'd hoped for, and tantivy's in-code query structure made it trivial to translate my (now-normalised) queries into something it understood. Even with the full dataset enabled, it could ingest and prepare a full search index in around 10 minutes, with room to optimise as needed.

With such a resounding success on the spike, I started to flesh the implementation out. To minimise the problem space, until now I'd been working exclusively with English data. In addition to English, the game also includes data in Japanese, German, and French. I added those to the dataset.

----

### tokenisation: thus did the first doom befall us.

Tantivy ships with built in tokenisation and stemming support for many languages, including all but Japanese among the languages I intended to support. There is also excellent third-party support for Fapanese, so I hadn't been too concerned from the outset about getting full text search working on this data set.

Integration of lindera, the Japanese tokenisation library I eventually chose, went smoothly. The dictionary files it used to provide stemming were pretty hefty on the file size - but I figured that was just the price one paid to get good search results in a difficult-to-stem language.

Excitedly, I ran some queries. English, as before, was working great! French also seemed to be working as expected, and some quick checks in Japanese showed that the stemming was working - at least, as well as I could tell.

But then I checked German - this time looking for "fire" to see if it would pick up some of the related spells such as "fire ii". Except, unlike English, the German localisation team had chosen to use the _other_ final fantasy naming scheme for spells. Where English had "fire" and "fire ii", German had "feuer" and "feura". This... did not stem well. Searches for either did not return the other, and splitting the difference with "feu" got me nowhere. An alternative was needed.

Looking into my options, I was quickly became disillusioned with the process of tokenising the strings. As a band-aid, I stripped out the tokenisation filters, and replaced the term queries with regex queries. It was a temporary measure, I told myself - I can spend some more time improving it once I'd got other things working. The regex queries at least _worked_.

So I moved onto the next item on the list - sorting out the relationships.

----

### relationships: thus did the second doom break us.

A little background is perhaps needed here. The data being exposed is effectively a relational data store, however the relations aren't encoded in the data or its associated metadata anywhere - only in the code within the game that reads it. As a result, these relationships are defined, and maintained, as part of the community schemas mentioned above.

This means the relationships can, and _do_, change.

Despite being primarily a key-value store, tantivy does support structured data such as json in its values. It does not, however, handle relationships that _aren't_ known at schema declaration time.

So I did the obvious thing any sane person would do, and implemented relations myself.

This effectively involved building a tree of the necessary queries, and then fanning them out, running as many of them as possible at once, until all the links were resolved and the final results could be derived. A naive approach, certainly - but it was a start. A start that worked... _slowly_.

A trivial query with a few resolved relations was still within the bounds of "quick", but anything that hit one of the more complicated multi-table relationships quickly bogged down the response times. Coupled with the slower string queries from the regex matching, I was looking at over a second for a moderately complicated query on my relatively powerful desktop cpu. For a web service, this was nigh on unacceptable to me.

I knew that there was great research out there on how to optimise this problem space, but it seemed like a _lot_ of work to continue trying to force this library to do something it just fundamentally wasn't designed for. I shelved search for a while - there were other parts of the project that were a higher priority, and we were aiming for a baseline launch in time for the upcoming expansion, Dawntrail. Search could wait until "after". Whatever that meant.

----

### sqlite: a paradise, part two.

The project had launched, the API was stable. We were live. Live without search, but live. My focus turned back to search - how _could_ I get search up and running, with appropriate performance.

I went back to the drawing board. For all its capabilities, tantivy really wasn't meshing with the relational nature of the data, and I was gaining little to no benefits from it's text search capabilities. Rather than digging my hole futher, I instead took the opportunity to look into options around old faithful RDBMS solutions.

Initially fiddling with both PostgreSQL and SQLite, I quickly settled in with SQLite. It had two main advantages over the alternative - for one, it was in-process. boilmaster is a completely self-sufficient monolith - for ease of development if nothing else - and PostgreSQL would have been the first external service it used. The other, and I'll admit this is perhaps the sillier of the two, was that I could raise the column limit. There are a _few_ sheets (tables) in the data that have several thousand columns. Far easier to set a compile flag to support that than try to split the data up.

Again, I was working with a limited data set to keep the dev cycle short. The previous work I had done for tantivy was not without merit - much of the query parsing and normalisation could be kept as-is, only needing to swap out the database itself, wiring up the new ingestion and query execution code paths.

Before long, I had a working SQLite database with a few tables. Queries were fast. Ingestion was fast. _Relationships_ were fast. It was working! I tweaked it to add the other three languages, just as I had months ago with tantivy. SQLite took it in it's stride.

I enabled the full dataset.

----

### ingestion performance: thus did the third doom undo us.

The ingestion phase, previously a minute or two at most, stretched on. Growing tired and excitement fading, I went to bed for the night.

On waking, the ingestion was still ongoing. The database files had swelled well beyond the size of the original dataset. This was far from what I'd hoped for.

I started looking into optimisations - how could I minimise the write time? Write-ahead logging seemed promising, but I was unsure about how to tune the checkpointing. While researching, I also asked around a little. A friend's message caught my eye.

> sounds like you want a virtual table, not sure how hard would it be to implement one tho <br/>
> all I know is they exist

I was vaguely aware of virtual tables - had seen them in passing while reading SQLite's documentation. Virtual tables allow you to register custom code that acts like a table, and can be queried by SQLite - but read its data however you like, rather than from the database file itself. I had originally dismissed them as an option - I didn't want to perform a full table scan for a query if I could avoid it - but my recent escapades in query building and testing had me doubting that position. I told myself I'd give it a quick test.

Spinning up a new branch to play around with, I quickly swapped out the sqlite library to rusqlite (it had bindings for virtual tables), and set about building a trivial implementation of one. No indexes or optimisations, just a full table scan for any query. much as I'd been able to inherit the query logic from tantivy when I started working with SQLite, again I was able to reuse the query logic from the ingested SQlite implementation for attempt at virtual tables - only the table's _implementation_ was changing, not the schema!

It was fast to query. Not as fast as using the database directly, certainly, but fast _enough_. Queries with relationships were unsurprisingly slow - it had to do a _lot_ of scans to resolve those, but this was a result well beyond what I had originally expected.

I reasoned that, given those results, it was worth putting in a bit more time on this path. If it worked, not only did it mean that preparing the databases was _faster_ due to the lack of data ingestion - it meant I could easily support searching any version of the data that the system had access to!

The primary optimisation added was an index. When preparing a query, SQLite runs a few different approaches on how it could query elements past your virtual table implementation, asking which approach is likely to be fastest. The vast majority of relationships in the queries I was generating result in a `JOIN` targeting a single table row by its id - something I'm able to do with no searching at all in my data access layer. By informing SQLite of this, I'm able to influence it to preference these joins wherever it can. With this in place, query performance for relationships shot through the roof, landing squarely in the "fast enough" bucket of the rest of the system.

Finally, a solution for search.

----

### conclusion.

And so, this journey comes to its end. Through the twists and turns, I ended up with an implementation I would never have even begun to consider back when this initiative began over a year ago.

Throughout the process, much was kept - the separation of concerns in query processing proved a sturdy base to build upon.

Throughout the process, _much_ was thrown away - from manic ideas on query optimisations, to entire folders of code.

As with any project, it will never be complete - there's always another feature to add, a bug to fix, an optimisation to agonise over.

But for now, it's live.
