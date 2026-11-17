<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['name', 'phone', 'email', 'message', 'is_read', 'ip_address'])]
class ContactMessage extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['is_read' => 'boolean'];
    }
}
