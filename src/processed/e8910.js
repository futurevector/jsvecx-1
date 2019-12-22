/***************************************************************************

  ay8910.c


  Emulation of the AY-3-8910 / YM2149 sound chip.

  Based on various code snippets by Ville Hallik, Michael Cuddy,
  Tatsuyuki Satoh, Fabrice Frances, Nicola Salmoria.

***************************************************************************/


/* register id's */




function e8910()
{
    this.psg = {
        index: 0,
        ready: 0,
        lastEnable: 0,
        PeriodA: 0,
        PeriodB: 0,
        PeriodC: 0,
        PeriodN: 0,
        PeriodE: 0,
        CountA: 0,
        CountB: 0,
        CountC: 0,
        CountN: 0,
        CountE: 0,
        VolA: 0,
        VolB: 0,
        VolC: 0,
        VolE: 0,
        EnvelopeA: 0,
        EnvelopeB: 0,
        EnvelopeC: 0,
        OutputA: 0,
        OutputB: 0,
        OutputC: 0,
        OutputN: 0,
        CountEnv: 0,
        Hold: 0,
        Alternate: 0,
        Attack: 0,
        Holding: 0,
        RNG: 0,
        VolTable: new Array(32),
        Regs: null,
        AnaA: 0,  // for virtual chip PIN monitoring
        AnaB: 0,
        AnaC: 0,
        lastReg: 0,
        lastVal: 0,
        BDir: 0,
        BC1: 0,
    };

    this.ctx = null;
    this.node = null;
    this.enabled = true;

    this.e8910_build_mixer_table = function()  {
        var i;
        var out;

        /* calculate the volume->voltage conversion table */
        /* The AY-3-8910 has 16 levels, in a logarithmic scale (3dB per 2) */
        /* The YM2149 still has 16 levels for the tone generators, but 32 for */
        /* the envelope generator (1.5dB per 2). */
        out = 0x0fff;
        for (i = 31;i > 0;i--)
        {
            this.psg.VolTable[i] = (out + 0.5)>>>0;	/* round to nearest */
            out /= 1.188502227;	/* = 10 ^ (1.5/20) = 1.5dB */
        }
        this.psg.VolTable[0] = 0;
    }

    this.e8910_write = function(r, v) {
        var old;

        this.psg.lastReg = r; // DrSnuggles
        this.psg.lastVal = v; // DrSnuggles

        this.psg.Regs[r] = v;

        /* A note about the period of tones, noise and envelope: for speed reasons,*/
        /* we count down from the period to 0, but careful studies of the chip     */
        /* output prove that it instead counts up from 0 until the counter becomes */
        /* greater or equal to the period. This is an important difference when the*/
        /* program is rapidly changing the period to modulate the sound.           */
        /* To compensate for the difference, when the period is changed we adjust  */
        /* our internal counter.                                                   */
        /* Also, note that period = 0 is the same as period = 1. This is mentioned */
        /* in the YM2203 data sheets. However, this does NOT apply to the Envelope */
        /* period. In that case, period = 0 is half as period = 1. */
        switch( r )
        {
            case (0):
            case (1):
                this.psg.Regs[(1)] &= 0x0f;
                old = this.psg.PeriodA;
                this.psg.PeriodA = (this.psg.Regs[(0)] + 256 * this.psg.Regs[(1)]) * 1;
                if (this.psg.PeriodA == 0) this.psg.PeriodA = 1;
                this.psg.CountA += this.psg.PeriodA - old;
                if (this.psg.CountA <= 0) this.psg.CountA = 1;
                break;
            case (2):
            case (3):
                this.psg.Regs[(3)] &= 0x0f;
                old = this.psg.PeriodB;
                this.psg.PeriodB = (this.psg.Regs[(2)] + 256 * this.psg.Regs[(3)]) * 1;
                if (this.psg.PeriodB == 0) this.psg.PeriodB = 1;
                this.psg.CountB += this.psg.PeriodB - old;
                if (this.psg.CountB <= 0) this.psg.CountB = 1;
                break;
            case (4):
            case (5):
                this.psg.Regs[(5)] &= 0x0f;
                old = this.psg.PeriodC;
                this.psg.PeriodC = (this.psg.Regs[(4)] + 256 * this.psg.Regs[(5)]) * 1;
                if (this.psg.PeriodC == 0) this.psg.PeriodC = 1;
                this.psg.CountC += this.psg.PeriodC - old;
                if (this.psg.CountC <= 0) this.psg.CountC = 1;
                break;
            case (6):
                this.psg.Regs[(6)] &= 0x1f;
                old = this.psg.PeriodN;
                this.psg.PeriodN = this.psg.Regs[(6)] * 1;
                if (this.psg.PeriodN == 0) this.psg.PeriodN = 1;
                this.psg.CountN += this.psg.PeriodN - old;
                if (this.psg.CountN <= 0) this.psg.CountN = 1;
                break;
            case (7):
                this.psg.lastEnable = this.psg.Regs[(7)];
                break;
            case (8):
                this.psg.Regs[(8)] &= 0x1f;
                this.psg.EnvelopeA = this.psg.Regs[(8)] & 0x10;
                this.psg.VolA = this.psg.EnvelopeA ? this.psg.VolE : this.psg.VolTable[this.psg.Regs[(8)] ? this.psg.Regs[(8)]*2+1 : 0];
                break;
            case (9):
                this.psg.Regs[(9)] &= 0x1f;
                this.psg.EnvelopeB = this.psg.Regs[(9)] & 0x10;
                this.psg.VolB = this.psg.EnvelopeB ? this.psg.VolE : this.psg.VolTable[this.psg.Regs[(9)] ? this.psg.Regs[(9)]*2+1 : 0];
                break;
            case (10):
                this.psg.Regs[(10)] &= 0x1f;
                this.psg.EnvelopeC = this.psg.Regs[(10)] & 0x10;
                this.psg.VolC = this.psg.EnvelopeC ? this.psg.VolE : this.psg.VolTable[this.psg.Regs[(10)] ? this.psg.Regs[(10)]*2+1 : 0];
                break;
            case (11):
            case (12):
                old = this.psg.PeriodE;
                this.psg.PeriodE = ((this.psg.Regs[(11)] + 256 * this.psg.Regs[(12)])) * 1;
                //if (this.psg.PeriodE == 0) this.psg.PeriodE = 1 / 2;
                if (this.psg.PeriodE == 0) this.psg.PeriodE = 1;
                this.psg.CountE += this.psg.PeriodE - old;
                if (this.psg.CountE <= 0) this.psg.CountE = 1;
                break;
            case (13):
                /* envelope shapes:
                C AtAlH
                0 0 x x  \___

                0 1 x x  /___

                1 0 0 0  \\\\

                1 0 0 1  \___

                1 0 1 0  \/\/
                          ___
                1 0 1 1  \

                1 1 0 0  ////
                          ___
                1 1 0 1  /

                1 1 1 0  /\/\

                1 1 1 1  /___

                The envelope counter on the AY-3-8910 has 16 steps. On the YM2149 it
                has twice the steps, happening twice as fast. Since the end result is
                just a smoother curve, we always use the YM2149 behaviour.
                */
                this.psg.Regs[(13)] &= 0x0f;
                this.psg.Attack = (this.psg.Regs[(13)] & 0x04) ? 0x1f : 0x00;
                if ((this.psg.Regs[(13)] & 0x08) == 0)
                {
                    /* if Continue = 0, map the shape to the equivalent one which has Continue = 1 */
                    this.psg.Hold = 1;
                    this.psg.Alternate = this.psg.Attack;
                }
                else
                {
                    this.psg.Hold = this.psg.Regs[(13)] & 0x01;
                    this.psg.Alternate = this.psg.Regs[(13)] & 0x02;
                }
                this.psg.CountE = this.psg.PeriodE;
                this.psg.CountEnv = 0x1f;
                this.psg.Holding = 0;
                this.psg.VolE = this.psg.VolTable[this.psg.CountEnv ^ this.psg.Attack];
                if (this.psg.EnvelopeA) this.psg.VolA = this.psg.VolE;
                if (this.psg.EnvelopeB) this.psg.VolB = this.psg.VolE;
                if (this.psg.EnvelopeC) this.psg.VolC = this.psg.VolE;

                break;
            case (14):
                break;
            case (15):
                break;
        }
    }

    this.toggleEnabled = function() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    this.e8910_callback = function(stream, length)
    {

        var idx = 0;
        var outn = 0;

        /* hack to prevent us from hanging when starting filtered outputs */
        if (!this.psg.ready || !this.enabled)
        {
            //memset(stream, 0, length * sizeof(*stream));
            for(var i = 0; i < length; i++) {
                stream[i] = 0;
            }
            return;
        }

        length = length << 1;

        /* The 8910 has three outputs, each output is the mix of one of the three */
        /* tone generators and of the (single) noise generator. The two are mixed */
        /* BEFORE going into the DAC. The formula to mix each channel is: */
        /* (ToneOn | ToneDisable) & (NoiseOn | NoiseDisable). */
        /* Note that this means that if both tone and noise are disabled, the output */
        /* is 1, not 0, and can be modulated changing the volume. */


        /* If the channels are disabled, set their output to 1, and increase the */
        /* counter, if necessary, so they will not be inverted during this update. */
        /* Setting the output to 1 is necessary because a disabled channel is locked */
        /* into the ON state (see above); and it has no effect if the volume is 0. */
        /* If the volume is 0, increase the counter, but don't touch the output. */
        if (this.psg.Regs[(7)] & 0x01)
        {
            if (this.psg.CountA <= length) this.psg.CountA += length;
            this.psg.OutputA = 1;
        }
        else if (this.psg.Regs[(8)] == 0)
        {
            /* note that I do count += length, NOT count = length + 1. You might think */
            /* it's the same since the volume is 0, but doing the latter could cause */
            /* interferencies when the program is rapidly modulating the volume. */
            if (this.psg.CountA <= length) this.psg.CountA += length;
        }
        if (this.psg.Regs[(7)] & 0x02)
        {
            if (this.psg.CountB <= length) this.psg.CountB += length;
            this.psg.OutputB = 1;
        }
        else if (this.psg.Regs[(9)] == 0)
        {
            if (this.psg.CountB <= length) this.psg.CountB += length;
        }
        if (this.psg.Regs[(7)] & 0x04)
        {
            if (this.psg.CountC <= length) this.psg.CountC += length;
            this.psg.OutputC = 1;
        }
        else if (this.psg.Regs[(10)] == 0)
        {
            if (this.psg.CountC <= length) this.psg.CountC += length;
        }

        /* for the noise channel we must not touch OutputN - it's also not necessary */
        /* since we use outn. */
        if ((this.psg.Regs[(7)] & 0x38) == 0x38)	/* all off */
            if (this.psg.CountN <= length) this.psg.CountN += length;

        outn = (this.psg.OutputN | this.psg.Regs[(7)]);

        /* buffering loop */
        while (length > 0)
        {
            var vol;
            var left  = 2;
            /* vola, volb and volc keep track of how long each square wave stays */
            /* in the 1 position during the sample period. */

            var vola, volb, volc;
            vola = volb = volc = 0;

            do
            {
                var nextevent;

                if (this.psg.CountN < left) nextevent = this.psg.CountN;
                else nextevent = left;

                if (outn & 0x08)
                {
                    if (this.psg.OutputA) vola += this.psg.CountA;
                    this.psg.CountA -= nextevent;
                    /* PeriodA is the half period of the square wave. Here, in each */
                    /* loop I add PeriodA twice, so that at the end of the loop the */
                    /* square wave is in the same status (0 or 1) it was at the start. */
                    /* vola is also incremented by PeriodA, since the wave has been 1 */
                    /* exactly half of the time, regardless of the initial position. */
                    /* If we exit the loop in the middle, OutputA has to be inverted */
                    /* and vola incremented only if the exit status of the square */
                    /* wave is 1. */
                    while (this.psg.CountA <= 0)
                    {
                        this.psg.CountA += this.psg.PeriodA;
                        if (this.psg.CountA > 0)
                        {
                            this.psg.OutputA ^= 1;
                            if (this.psg.OutputA) vola += this.psg.PeriodA;
                            break;
                        }
                        this.psg.CountA += this.psg.PeriodA;
                        vola += this.psg.PeriodA;
                    }
                    if (this.psg.OutputA) vola -= this.psg.CountA;
                }
                else
                {
                    this.psg.CountA -= nextevent;
                    while (this.psg.CountA <= 0)
                    {
                        this.psg.CountA += this.psg.PeriodA;
                        if (this.psg.CountA > 0)
                        {
                            this.psg.OutputA ^= 1;
                            break;
                        }
                        this.psg.CountA += this.psg.PeriodA;
                    }
                }

                if (outn & 0x10)
                {
                    if (this.psg.OutputB) volb += this.psg.CountB;
                    this.psg.CountB -= nextevent;
                    while (this.psg.CountB <= 0)
                    {
                        this.psg.CountB += this.psg.PeriodB;
                        if (this.psg.CountB > 0)
                        {
                            this.psg.OutputB ^= 1;
                            if (this.psg.OutputB) volb += this.psg.PeriodB;
                            break;
                        }
                        this.psg.CountB += this.psg.PeriodB;
                        volb += this.psg.PeriodB;
                    }
                    if (this.psg.OutputB) volb -= this.psg.CountB;
                }
                else
                {
                    this.psg.CountB -= nextevent;
                    while (this.psg.CountB <= 0)
                    {
                        this.psg.CountB += this.psg.PeriodB;
                        if (this.psg.CountB > 0)
                        {
                            this.psg.OutputB ^= 1;
                            break;
                        }
                        this.psg.CountB += this.psg.PeriodB;
                    }
                }

                if (outn & 0x20)
                {
                    if (this.psg.OutputC) volc += this.psg.CountC;
                    this.psg.CountC -= nextevent;
                    while (this.psg.CountC <= 0)
                    {
                        this.psg.CountC += this.psg.PeriodC;
                        if (this.psg.CountC > 0)
                        {
                            this.psg.OutputC ^= 1;
                            if (this.psg.OutputC) volc += this.psg.PeriodC;
                            break;
                        }
                        this.psg.CountC += this.psg.PeriodC;
                        volc += this.psg.PeriodC;
                    }
                    if (this.psg.OutputC) volc -= this.psg.CountC;
                }
                else
                {
                    this.psg.CountC -= nextevent;
                    while (this.psg.CountC <= 0)
                    {
                        this.psg.CountC += this.psg.PeriodC;
                        if (this.psg.CountC > 0)
                        {
                            this.psg.OutputC ^= 1;
                            break;
                        }
                        this.psg.CountC += this.psg.PeriodC;
                    }
                }

                this.psg.CountN -= nextevent;
                if (this.psg.CountN <= 0)
                {
                    /* Is noise output going to change? */
                    if ((this.psg.RNG + 1) & 2)	/* (bit0^bit1)? */
                    {
                        this.psg.OutputN = (~this.psg.OutputN & 0xff); // raz
                        outn = (this.psg.OutputN | this.psg.Regs[(7)]);
                    }

                    /* The Random Number Generator of the 8910 is a 17-bit shift */
                    /* register. The input to the shift register is bit0 XOR bit3 */
                    /* (bit0 is the output). This was verified on AY-3-8910 and YM2149 chips. */

                    /* The following is a fast way to compute bit17 = bit0^bit3. */
                    /* Instead of doing all the logic operations, we only check */
                    /* bit0, relying on the fact that after three shifts of the */
                    /* register, what now is bit3 will become bit0, and will */
                    /* invert, if necessary, bit14, which previously was bit17. */
                    if (this.psg.RNG & 1) {
                        this.psg.RNG ^= 0x24000; /* This version is called the "Galois configuration". */
                    }
                    this.psg.RNG >>= 1;
                    this.psg.CountN += this.psg.PeriodN;
                }

                left -= nextevent;
            } while (left > 0);

            /* update envelope */
            if (this.psg.Holding == 0)
            {
                this.psg.CountE -= 2;
                if (this.psg.CountE <= 0)
                {
                    do
                    {
                        this.psg.CountEnv--;
                        this.psg.CountE += this.psg.PeriodE;
                    } while (this.psg.CountE <= 0);

                    /* check envelope current position */
                    if (this.psg.CountEnv < 0)
                    {
                        if (this.psg.Hold)
                        {
                            if (this.psg.Alternate)
                                this.psg.Attack ^= 0x1f;
                            this.psg.Holding = 1;
                            this.psg.CountEnv = 0;
                        }
                        else
                        {
                            /* if CountEnv has looped an odd number of times (usually 1), */
                            /* invert the output. */
                            if (this.psg.Alternate && (this.psg.CountEnv & 0x20))
                                this.psg.Attack ^= 0x1f;

                            this.psg.CountEnv &= 0x1f;
                        }
                    }

                    this.psg.VolE = this.psg.VolTable[this.psg.CountEnv ^ this.psg.Attack];
                    /* reload volume */
                    if (this.psg.EnvelopeA) this.psg.VolA = this.psg.VolE;
                    if (this.psg.EnvelopeB) this.psg.VolB = this.psg.VolE;
                    if (this.psg.EnvelopeC) this.psg.VolC = this.psg.VolE;
                }
            }

            this.psg.AnaA = vola * this.psg.VolA;
            this.psg.AnaB = volb * this.psg.VolB;
            this.psg.AnaC = volc * this.psg.VolC;

            vol = (vola * this.psg.VolA + volb * this.psg.VolB + volc * this.psg.VolC) / (3 * 2);
            if (--length & 1) {
                var val = vol / 0x0fff;
                stream[idx++] = val;
            }
        }
    }

    this.init = function(regs) {
        this.psg.Regs = regs;
        this.psg.RNG  = 1;
        this.psg.OutputA = 0;
        this.psg.OutputB = 0;
        this.psg.OutputC = 0;
        this.psg.OutputN = 0xff;
        this.psg.ready = 0;
    }

    this.start = function() {
        var self = this;
        if (this.ctx == null && (window.AudioContext || window.webkitAudioContext)) {
            self.e8910_build_mixer_table();
            var ctx = window.AudioContext ?
                new window.AudioContext({sampleRate: 22050}) :
                new window.webkitAudioContext();
            this.ctx = ctx;
            this.node = this.ctx.createScriptProcessor(512, 0, 1);
            this.node.onaudioprocess = function(e) {
                self.e8910_callback(e.outputBuffer.getChannelData(0), 512);
            }
            this.node.connect(this.ctx.destination);
            var resumeFunc =
                function(){if (ctx.state !== 'running') ctx.resume();}
            document.documentElement.addEventListener("keydown", resumeFunc);
            document.documentElement.addEventListener("click", resumeFunc);
        }
        if (this.ctx) this.psg.ready = 1;
    }

    this.stop = function() {
        this.psg.ready = 0;
    }
}
