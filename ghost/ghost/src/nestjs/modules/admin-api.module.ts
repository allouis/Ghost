import {Module} from '@nestjs/common';
import {ExampleController} from '../../http/admin/controllers/example.controller';
import {ExampleService} from '../../core/example/example.service';
import {ExampleRepositoryInMemory} from '../../db/in-memory/example.repository.in-memory';
import {ActorRepositoryInMemory} from '../../db/in-memory/actor.repository.in-memory';
import {ActivityPubController} from '../../http/admin/controllers/activitypub.controller';
import {WebFingerService} from '../../core/activitypub/webfinger.service';

export const AdminAPIModule = {
    controllers: [ExampleController, ActivityPubController],
    exports: [ExampleService, 'WebFingerService'],
    providers: [
        ExampleService,
        {
            provide: 'ExampleRepository',
            useClass: ExampleRepositoryInMemory
        }, {
            provide: 'ActorRepository',
            useClass: ActorRepositoryInMemory
        }, {
            provide: 'WebFingerService',
            useClass: WebFingerService
        }
    ]
};
