/*
JSVecX : JavaScript port of the VecX emulator by Valavan Manohararajah,
         (http://www.valavan.net/vectrex.html).

Copyright (C) 2010
raz0red (www.twitchasylum.com)

This software is provided 'as-is', without any express or implied
warranty.  In no event will the authors be held liable for any
damages arising from the use of this software.

Permission is granted to anyone to use this software for any
purpose, including commercial applications, and to alter it and
redistribute it freely, subject to the following restrictions:

1.	The origin of this software must not be misrepresented; you
must not claim that you wrote the original software. If you use
this software in a product, an acknowledgment in the product
documentation would be appreciated but is not required.

2.	Altered source versions must be plainly marked as such, and
must not be misrepresented as being the original software.

3.	This notice may not be removed or altered from any source
distribution.
*/

function vector_t()
{
    //long x0, y0; /* start coordinate */
    this.x0 = 0;
    this.y0 = 0;
    //long x1, y1; /* end coordinate */
    this.x1 = 0;
    this.y1 = 0;

    /* color [0, VECTREX_COLORS - 1], if color = VECTREX_COLORS, then this is
     * an invalid entry and must be ignored.
     */
    //unsigned char color;
    this.color = 0;

    this.reset = function()
    {
        this.x0 = this.y0 = this.x1 = this.y1 = this.color = 0;        
    }
}