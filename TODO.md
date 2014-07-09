* Handle extensions with the same field name
* Test Repository
* Test models and model extensions
* Test serializing model extensions
* Test Method Extensions

    foo.getValue('foo') // gets the value of foo 

    foo.getValue('foo', 'squareup.bar') // Get the value of foo with an extension
    foo.getValue(10);

    // If no conflict

    foo.foo // get foo normally
    foo.getValue('foo', 'squareup.bar') // Get the value of foo with an extension
    foo.getValue(10); // Get by id


    ADD A WARNING WHEN COMPILING THAT THERE ARE POTENTIAL COLLISIONS
