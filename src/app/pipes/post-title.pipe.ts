import { Pipe, PipeTransform } from '@angular/core';
import { IGroupPost } from '../../interfaces/IgroupPost';

@Pipe({
  name: 'postTitle',
  standalone:false
})
export class PostTitlePipe implements PipeTransform {

  transform(post: IGroupPost): string {
    if (!post) return '';
    return post.text;
  }

}
