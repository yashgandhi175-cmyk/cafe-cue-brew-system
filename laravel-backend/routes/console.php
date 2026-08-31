<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('marketing:process-queue')->everyMinute()->withoutOverlapping();
Schedule::command('marketing:recover-stalled')->everyTenMinutes()->withoutOverlapping();
