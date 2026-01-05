Setting Up Self-Improving Skills in Claude Code: Manual & Automatic Methods

In this video, you'll learn how to set up self-improving skills within Claude Code. The tutorial addresses the key problem of Large Language Models (LLMs) not learning from previous interactions, causing repeated corrections in coding tasks. The solution involves creating a reflex skill that can analyze sessions, extract corrections, and update skill files. The video outlines both manual and automatic methods to implement these skills, leveraging Git version control for iterative improvements. By the end of this tutorial, you'll be able to continuously improve your coding harness, ensuring more efficient and less redundant coding sessions.

0:00
In this video, I'm going to be showing
0:01
you how to set up self-improving skills
0:02
within cloud code. Now, one of the
The Problem with Current LLMs
0:04
issues with LLMs right now is they don't
0:06
actually learn from us. Just to run
0:07
through an example of this, let's say
0:09
you're working on a web application.
0:10
There might be a mistake that the coding
0:12
harness or the model that you're using
0:14
makes within the first iteration of what
0:16
it's trying to do. Let's say you want to
0:18
add a new feature and then it has a
0:20
button as a part of that feature. Just a
0:21
simple but relatively common mistake
0:23
could be that an LLM doesn't actually
0:25
know the particular button that you
0:26
might want to leverage. Generally
0:28
speaking, you can tell from certain
0:29
inputs and buttons what is actually
0:30
generated from an LLM. Now, you might
0:32
correct that mistake and say, "Okay, I
0:34
actually want you to reference this
0:36
button." But the issue with this is when
0:37
you actually correct it within that
0:39
session, when you pick up in a second
0:41
session, it's going to make that same
0:42
mistake again. And you're going to have
0:44
to correct it or remember to actually
0:46
specify to reference that particular
0:48
button. Same thing for the next session.
0:50
And this loop will continue. Every
0:52
conversation effectively starts from
0:54
zero. And the thing with this problem is
0:55
it touches every single model that is
0:57
out there as well as every single coding
1:00
harness. Not having a good effective
1:02
memory mechanism within the harness in
1:04
my opinion can definitely lead to a lot
1:06
of different frustrations. Now this
1:07
frustration can come up in a number of
1:09
different ways. It might not follow
1:11
naming conventions. Use the proper
1:12
logging convention. It might not
1:14
validate inputs the proper way that you
1:16
did within other components. Had that
1:18
experience where you're just thinking, I
1:19
just told you this yesterday or I told
1:20
you this last week. The issue with this
1:22
is there's no memory. your preferences
1:24
aren't persisted and effectively without
1:26
some form of memory is you're going to
1:28
be repeating yourself forever. The
1:29
solution to this is relatively simple.
1:31
We can actually set up a reflex skill to
1:33
analyze the session, extract corrections
1:36
and update the skill file. One thing
1:37
that I've been playing around with is
1:39
for my global skills that I use across
1:41
my machine is I have all of those
1:43
different skills versioned on GitHub as
1:46
I have them reflect and iterate on those
1:48
particular skills. I can see all of
1:49
those different memories over time and
1:51
if there are regressions and if I want
1:52
to roll it back, it makes it easy to
1:54
have it all within the version control
1:56
within git. So now the way that I've set
1:58
this up is there's a few different
1:59
mechanisms to this and it's relatively
2:01
simple. I have the ability to turn
2:02
reflect on, reflect off, and then
2:05
reflect status. There's two different
2:06
ways that we can do this. There's a
2:08
manual way, and then there's also an
2:10
automatic way. First, let's touch on the
Manual Skill Reflection
2:12
manual flow. There's a skill called
2:14
reflect, and then there's a slash
2:15
command. As soon as you go through a
2:16
conversation and if there's something
2:18
that you want to have it remember, you
2:20
can simply call that slash command and
2:21
it will have the context of the
2:23
conversation and then it will reference
2:25
the particular skills and then it can go
2:27
and update those accordingly. And the
2:29
nice thing with the manual update is
2:30
you're going to have a lot more control
2:32
in terms of what is actually being
2:33
updated within the skill file. Just to
2:36
go through a hypothetical example, so
2:37
you might leverage the skill, it might
2:39
say here's my review of the O module and
2:42
you might realize, oh, it's actually not
2:43
looking for SQL injections. we could go
2:45
and specify always check for SQL
2:47
injections and then from there cloud
2:49
will go in the current session check for
2:51
SQL injections similar to the button
2:53
example that I had and then ideally it
2:55
will come back and show you that it's
2:56
done and the really nice thing with this
2:58
is corrections are all signals that
3:00
could be good memories approvals are
3:02
further confirmations and the reflect
3:04
command and skill will extract both of
3:07
these and then after that process all
3:09
that we need to do is actually run the
3:10
command to reflect we have two different
3:12
ways that we can do this we can run the
3:14
reflect command And or we can also
3:15
explicitly pass in the skill name as
3:18
well. But if you just pass in reflect,
3:19
it will have the contextual awareness
3:21
since it is within that thread to know
3:23
when that skill was actually invoked.
3:25
Effectively, Claude will analyze and
3:27
scan the conversation for corrections.
3:29
It will identify success patterns, post
3:31
skill updates, and the way that this is
3:33
set up is it will give you a breakdown
3:34
of different confidence levels. There
3:36
will be high, medium, as well as low. If
3:38
I say never do X, like never come up
3:40
with a button style on your own within
3:42
this project, you can go ahead and
3:44
specify something like that. Medium are
3:46
going to be patterns that worked well.
3:47
And low are going to be observations to
3:49
review later. And all of this works is
3:52
just through this skill file. You're
3:53
going to be able to edit this, tweak it
3:55
if you want to have version control, or
3:56
if you don't, you can go ahead add in a
3:58
G integration. Additionally, you can
4:00
just remove that if you don't want to
4:01
leverage it. I'll link all of this
4:03
within the description of the video
4:04
before it actually updates through
4:05
respective skill. This is what the
4:07
review and approval process looks like.
4:09
We have the signals that were detected.
4:11
We have the proposed changes. And then
4:13
we have the commit message that it's
4:15
going to add if we go and accept those.
4:17
Additionally, what we can do within here
4:18
is we can just change and we can change
4:20
with natural language. That's one of the
4:22
really nice things with this in terms of
4:23
actually applying these to our skills
4:25
directory as well as pushing them to
4:26
get. We can either click Y and or we can
4:29
type with natural language the different
4:30
changes that we want to have within
4:32
Cloud Code. And then once you've either
4:33
made those changes or you've accepted
4:35
what Claude has proposed, it's going to
4:37
edit the particular skill and then it's
4:39
going to go ahead and commit that within
4:40
Git. And then it's going to go ahead and
4:41
push that up. And one thing about this
4:43
process that I did want to have within
4:45
at least my setup is for all of those
4:47
different changes that it makes within
4:48
the skill, make sure you're actually
4:50
versioning all of those as Next up, you
Automating Skill Reflection
4:52
can actually take the same flow and you
4:54
can automate it. You can have hooks
4:55
trigger reflections automatically. Now,
4:57
if you haven't used hooks before,
4:58
effectively what they are commands that
5:00
run on different events. Now, there is a
5:03
stop hook, and this is something that I
5:04
covered in an earlier video on the Ralph
5:07
Wigums loop where what you can do is to
5:09
have Claude persist and run
5:10
automatically. You can actually bind a
5:12
shell script to invoke and have Claude
5:14
continue whenever that stop hook is run.
5:17
But it can also be perfect for end of
5:20
session analysis just like this. Now the
5:22
syntax is broken within this example
5:24
here, but effectively what this is going
5:25
to do is on the stop hook, we're going
5:27
to go and trigger that shell script to
5:29
reflect. If you are going to be running
5:31
this automatically, you do want to have
5:32
a lot of confidence in terms of that
5:34
reflect mechanism and what it's actually
5:36
doing. But what it will do is you will
5:38
go through the process just like before.
5:40
And then once the session ends, the hook
5:42
is going to analyze and automatically
5:44
update all of those different learnings.
5:46
This is going to be that continual
5:48
self-improving loop that you can have
5:49
within cloud code. You can very well
5:51
also leverage the same strategy of
5:54
continual learning within other agentic
5:56
systems as well. And so what it will do
5:58
is in that button example, it will go
6:00
ahead, it will learn from the session.
6:01
Then what it will look like within cloud
6:03
code is we'll see learn from session and
6:05
it will have the skill that it updated.
6:06
So it's effectively more of a silent
6:08
notification, but just like this
6:10
indication like you see on the screen
6:11
here that it actually updated that
6:13
particular skill. And then in terms of
6:14
the reflect shell script that gets
6:16
invoked on the stop hook, we can turn it
6:18
on. There's a mechanism to reflect on,
6:20
reflect off, and this is effectively
6:22
going to work the same way as the
6:23
reflect pattern that we had, though just
6:25
being automatic. The one thing that I
Benefits and Conclusion
6:27
find exciting about this is you can
6:29
leverage skills for a ton of different
6:31
things. This can be for code review, API
6:33
design, testing, documentation, amongst
6:35
a ton of other use cases. And having
6:38
skills actually be able to learn from
6:39
your conversation, I think, can be
6:41
something that is pretty powerful. and
6:43
also having it within skills. You don't
6:45
have to worry about embeddings and
6:46
memory and all of the complexity that
6:48
comes with typical memory systems that
6:50
we see out there. This is going to all
6:51
be within a markdown file that you can
6:53
simply read with natural language. And
6:55
now the other thing that I like about
6:56
this is actually having it within git
6:58
cuz you can see how the system learns
7:00
over time. If you have a front-end
7:01
skill, you can see all of the different
7:03
things that are learned as it goes
7:05
through instead of actually having to
7:06
start from blank every single time. But
7:08
I think the more interesting aspect of
7:10
this is you can see how those skills
7:12
evolve over time and how your system
7:14
gets smarter over time as you have
7:16
conversations with it. You're going to
7:18
be able to see all of the different
7:19
learnings for the particular skills if
7:21
you are to leverage this within Git as
7:23
well. And just to wrap up, if you aren't
7:25
as familiar with agent skills, I'll put
7:26
a couple links within the description of
7:28
the video. I'll also do some other
7:30
videos probably over the course of the
7:32
month on this type of topic as well. So
7:34
feel free to subscribe if you're
7:35
interested in this type of content.
7:37
Okay. Okay, last but not least, just to
7:38
sum up what we've touched on, there's a
7:40
couple different ways to do this. You
7:41
can do it through the autodetect method,
7:42
you can do it through the manual method,
7:44
or you can toggle on and off and do a
7:46
little bit of both. If you do want to
7:47
leverage the auto detect method, see how
7:49
it works for a little bit. You can try
7:51
that. Additionally, I'd encourage you
7:53
just get familiar with the actual
7:55
reflect mechanism. I'll put a link to
7:57
the working copy of the one that I'm
7:59
leveraging within the description of the
8:00
video if you're interested. And then we
8:02
also have the toggle mechanism. So, if
8:04
you want to use a combination of manual
8:06
as well as automatic, you have to turn
8:08
on that auto detect mechanism when it's
8:10
triggered within the hook. Okay. So, all
8:12
in all, the goal with this is to correct
8:14
once and then never again. This is a
8:16
start. I'm not saying this is definitely
8:18
the end solution, but hopefully it
8:19
inspires some ideas in terms of how you
8:21
can leverage skills, self-improvement,
8:23
as well as continual learning.
8:24
Otherwise, if you're interested in this
8:25
type of stuff, follow the channel. I'll
8:27
be covering some more ideas in and
8:28
around this type of stuff over the
8:30
coming weeks. But otherwise, if you
8:31
found this video useful, please comment,
8:33
share, and subscribe.
