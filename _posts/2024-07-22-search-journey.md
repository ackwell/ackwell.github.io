---
title: a journey into search.
---

i've recently wrapped up the core implementation of a search feature - one that went through many twists and turns. it was a long journey to get to where it stands today, and i'd like to revisit that journey to share some of my learnings (and mistakes)!

the feature was written as part of [boilmaster](https://github.com/ackwell/boilmaster), a web service written in rust that offers an http api for accessing game data from final fantasy xiv. boilmaster did not start development in a vacuum - from the outset, it was designed to replace the existing server software powering [xivapi](https://xivapi.com). as such, many of its requirements and implementation decisions stem from old learnings and pain points experienced by the maintainers of that service.

relevant to this tale are it's requirements around ongoing maintenance work - or rather, the lack thereof. we want to reduce the manual intervention to keep the system running to the absolute minimum possible. to this end, the service is able to automatically update the game data it uses, as well as the community-contributed schema declarations used to read the data.

we start the journey into search with, of all things, a search engine library

----

### tantivy: a paradise.

i begun by spiking out an implementation of search over a reduced dataset using [tantivy](https://github.com/quickwit-oss/tantivy) - a search engine library akin in purpose to lucene, written in rust.

our schemas are rarely comprehensive, and may change regularly as discoveries are made and mistakes are fixed. as a consequence, an early choice was to completely decouple the data in the search engine from those schemas. an incoming search query would first be "normalised", replacing schema-driven naming and structures with a flattened query targeting data directly by its position in raw file structure.

early results were promising! query speed was well and truly beyond what i'd hoped for, and tantivy's in-code query structure made it trivial to translate my (now-normalised) queries into something it understood. even with the full dataset enabled, it could ingest and prepare a full search index in around 10 minutes, with room to optimise if needed.

with such a resounding success on the spike, i started to flesh the implementation out. to minimise the problem space, until now i'd been working exclusively with english data. in addition to english, the game also includes data in japanese, german, and french. i added those to the dataset.

----

### tokenisation: thus did the first doom befall us.

tantivy ships with built in tokenisation and stemming support for many languages, including all but japanese in the languages i intended to support. there is also excellent third-party support for japanese, so i hadn't been too concerned from the outset about getting full text search working on this data set.

integration of lindera, the japanese-supporting library i eventually chose, went smoothly. the dictionary files it used to provide stemming were pretty hefty on the file size - but i figured that was just the price one paid to get good search results in a difficult-to-stem language.

excitedly, i ran some queries. english, as before was working great! french also seemed to be working as expected, and some quick checks in japanese showed that the stemming was working - at least, as well as i could tell.

but then i checked german - this time looking for "fire" to see if it would pick up some of the related spells such as "fire ii". except, unlike english, the german localisation team had chosen to use the _other_ final fantasy naming scheme for spells. where english had "fire" and "fire ii", german had "feuer" and "feura". this... did not stem well.

looking into my options here, i was quickly becoming disillusioned with the tokenisation of the strings. as a band-aid, i stripped out the tokenisation filters, and replaced the partial string queries with regex queries. it was a temporary measure, i told myself - i can spend some more time improving it once i'd got other things working. the regex queries at least _worked_.

so i moved onto the next item on the list - sorting out the relationships.

----

### relationships: thus did the second doom break us.

a little background is perhaps needed here. the data being exposed is effectively a relational data store, however the relations aren't encoded in the data or its associated metadata anywhere - only in the code within the game that reads it. as a result, these relationships are defined, and maintained, as part of the schemas mentioned above.

this means the relationships can, and _do_, change.

despite being primarily a key-value store, tantivy does support structured data such as json in its values. it does not, however, handle relationships that _aren't_ known at schema declaration time.

so i did the obvious thing any sane person would do, and implemented relations myself.

this effectively involved building a tree of the necessary queries, and then fanning them out, running as many of them as possible at once, until all the links were resolved and the final results could be derived. a naive approach, certainly - but it was a start. a start that _worked_. a start that worked _slowly_.

a trivial query with a few resolved relations was still within the bounds of "quick", but anything that hit one of the more complicated multi-table relationships quickly bogged down the response times. coupled with the slower string queries from the regex matching, i was looking at over a second for a moderately complicated query on my relatively powerful desktop cpu. for a web service, this was nigh on unacceptable to me.

i knew that there was great research out there on how to optimise this problem, but it seemed like a _lot_ of work to continue trying to force this library to do something it just fundamentally wasn't designed for. i shelved search for a while - there were other parts of the project that were a higher priority, and we were aiming for a baseline launch in time for the upcoming expansion, dawntrail. search could wait until... _after_. whatever that meant.

----

### sqlite: a paradise, part two.

the project had launched, the api was stable. we were live. live without search, but live. my focus turned back to search - how _could_ i get search up and running, with appropriate performance.

i went back to the drawing board. for all its capabilities, tantivy really wasn't meshing with the relational nature of the data, and i was gaining little to no benefits from it's text search capabilities. instead, i looked to the old faithful rdbms.

initially fiddling with both postgres and sqlite, i quickly settled in with sqlite. it had two main advantages over the alternative - for one, it was in-process. boilmaster is a completely self-sufficient monolith - for ease of development if nothing else - and postgres would have been the first external service it used. the other, and i'll admit this is perhaps the sillier of the two, was that i could raise the column limit. there are a _few_ sheets (tables) in the data that have several thousand columns. far easier to set a compile flag to support that than try to split the data up.

again, i was working with a limited data set to keep the dev cycle short. the previous work i had done for tantivy was not without merit - much of the query parsing and normalisation could be kept as-is, only needing to swap out the database itself, wiring up the new ingestion and query execution code paths.

before long, i had a working sqlite database with a few tables. queries were fast. ingestion was fast. _relationships_ were fast. it was working! i tweaked it to add the other three languages, just as i had months ago in tantivy. sqlite took it in it's stride.

i enabled the full dataset.

----

### ingestion performance: thus did the third doom undo us.

the ingestion phase, previously a minute or two at most, stretched on. growing tired and excitement fading, i went to bed for the night.

when i woke up, the ingestion was still going. the database files had swelled well beyond the size of the original dataset. this was not not what i'd hoped for.

i started looking into optimisations - how could i minimise the write time? write-ahead logging seemed promising, but i was unsure about how to tune the checkpointing. while researching, i also asked around a little. a friend's message caught my eye.

> sounds like you want a virtual table, not sure how hard would it be to implement one tho
> all I know is they exist

i also knew they existed, had seen them in passing while reading sqlite's documentation. virtual tables allow you to register custom code that acts like a table, and can be queried by sqlite - but read its data however you like, rather than from the database file itself. i had originally dismissed them as an option - i didn't want to perform a full table scan for a query if i could avoid it - but my recent escapades in query building and testing had me doubting that position. i told myself i'd give it a quick test.

spinning up a new branch to play around with, i quickly swapped out the sqlite library to rusqlite (it had bindings for virtual tables), and set about building a trivial implementation of one. no indexes or optimisations, just a full table scan for any query. much as i'd been able to inherit the query logic from tantivy when i started working with sqlite, again i was able to reuse the query logic from the ingested sqlite implementation for this - only the table _implementation_ was changing, not the schema!

it was fast. not as fast as using the database directly, certainly, but fast _enough_. queries with relationships were unsurprisingly slow - it had to do a _lot_ of scans to resolve those, but this was a result well beyond what i had expected.

i reasoned that, given those results, it was worth putting in a bit more time on this path. if it worked, not only did it mean that preparing the databases was _faster_ due to the lack of data ingestion - it meant i could easily support searching any version of the data i had access to!

the primary optimisation added was an index. when preparing a query, sqlite runs a few different approaches on how it could query elements past your virtual table implementation, asking which approach is likely to be fastest. the vast majority of relationships in the queries i was generating result in a join targeting a single table row by its id - something i'm able to do with no searching at all in my data access layer. by informing sqlite of this, i'm able to influence it to preference these joins wherever it can. with this in place, query performance for relationships shot through the roof, landing squarely in the "fast enough" of the rest of the system.

finally, a solution for search.

----

### conclusion.

and so, this journey comes to its end. through the twists and turns, i ended up with an implementation i would never have even begun to consider back when this initiative began over a year ago.

throughout the process, much was kept - the separation of concerns in query processing proved a sturdy base to build upon.

throughout the process, _much_ was thrown away - from manic ideas on query optimisations, to entire folders of code.

as with any project, it will never be complete - there's always another feature to add, a bug to fix, an optimisation to agonise over.

but for now, it's live.
